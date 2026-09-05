import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { settingsService, type AppSettings } from '../services/settingsService';
import {
  urlSafetyService,
  type UrlSafetyDomainRow,
  type UrlSafetyStatus,
} from '../services/urlSafetyService';
import { useSettings } from '../contexts/SettingsContext';

const ADMIN_SECTION_CARD =
  'bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5';
const ADMIN_SECTION_HEADER =
  'bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5';
const ADMIN_SECTION_TITLE =
  'text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2';
const ADMIN_SECTION_SUBTITLE = 'text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5';
const ADMIN_FIELD =
  'w-full bg-slate-50 dark:bg-slate-900/50 border border-sky-200/70 dark:border-sky-800/40 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400';
const ADMIN_PRIMARY_BTN =
  'bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-sky-500/20';
const ADMIN_SECONDARY_BTN =
  'bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950/40 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors';

function categoryBadgeClass(category: string): string {
  switch (category) {
    case 'malware':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 border-rose-200/80 dark:border-rose-800/60';
    case 'phishing':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200 border-orange-200/80 dark:border-orange-800/60';
    case 'adult':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200 border-violet-200/80 dark:border-violet-800/60';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-600';
  }
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${categoryBadgeClass(category)}`}
    >
      {category}
    </span>
  );
}

type CollapsibleAdminSectionProps = {
  title: string;
  emoji: string;
  subtitle?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

/** Collapsed by default so the page stays focused on the main settings card. */
const CollapsibleAdminSection: React.FC<CollapsibleAdminSectionProps> = ({
  title,
  emoji,
  subtitle,
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={ADMIN_SECTION_CARD}>
      <button
        type="button"
        className={`${ADMIN_SECTION_HEADER} w-full text-left cursor-pointer hover:brightness-[0.99] dark:hover:brightness-110 transition-[filter] ${
          open ? '' : 'border-b-0'
        }`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className={ADMIN_SECTION_TITLE}>
              <span aria-hidden>{emoji}</span> {title}
            </h3>
            {subtitle ? <p className={ADMIN_SECTION_SUBTITLE}>{subtitle}</p> : null}
          </div>
          <span
            className={`mt-0.5 shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200/80 dark:border-sky-700/60 bg-white/70 dark:bg-slate-900/50 text-sky-700 dark:text-sky-200 text-sm transition-transform ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden
          >
            ▾
          </span>
        </div>
      </button>
      {open ? children : null}
    </div>
  );
};

interface UrlSafetyAdminProps {
  settings: AppSettings;
  onSettingsChange: (partial: Partial<AppSettings>) => void;
  onRefresh: () => Promise<void>;
  isMobile?: boolean;
  setError: (msg: string) => void;
}

function formatFetchedAt(ts: number): string {
  if (!ts) return 'Never';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return String(ts);
  }
}

export const UrlSafetyAdmin: React.FC<UrlSafetyAdminProps> = ({
  settings,
  onSettingsChange,
  onRefresh,
  isMobile,
  setError,
}) => {
  const { refreshSettings } = useSettings();
  const [status, setStatus] = useState<UrlSafetyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allowlistText, setAllowlistText] = useState('');
  const [allowlistSaving, setAllowlistSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Domain browser
  const [domainRows, setDomainRows] = useState<UrlSafetyDomainRow[]>([]);
  const [domainTotal, setDomainTotal] = useState(0);
  const [domainPage, setDomainPage] = useState(1);
  const [domainQ, setDomainQ] = useState('');
  const [domainCategory, setDomainCategory] = useState('');
  const [domainSource, setDomainSource] = useState('');
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [pageSize, setPageSize] = useState(50);
  const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

  // Manual add
  const [manualText, setManualText] = useState('');
  const [manualCategory, setManualCategory] = useState<'malware' | 'phishing' | 'adult'>('malware');
  const [manualSaving, setManualSaving] = useState(false);

  const enabled = settings.url_safety_enabled !== '0';
  const checkAdult = settings.url_safety_check_adult !== '0';
  const blockMalicious = settings.url_safety_block_malicious === '1';

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [st, list] = await Promise.all([
        urlSafetyService.getStatus(),
        urlSafetyService.getAllowlist(),
      ]);
      setStatus(st);
      setAllowlistText(list.join('\n'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load URL Safety status');
    } finally {
      setLoading(false);
    }
  }, [setError]);

  const loadDomains = useCallback(async () => {
    setDomainsLoading(true);
    try {
      const data = await urlSafetyService.listDomains({
        q: domainQ.trim() || undefined,
        category: domainCategory || undefined,
        source: domainSource || undefined,
        page: domainPage,
        pageSize,
      });
      setDomainRows(data.rows || []);
      setDomainTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load domain table');
    } finally {
      setDomainsLoading(false);
    }
  }, [domainQ, domainCategory, domainSource, domainPage, pageSize, setError]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  const persistToggle = async (key: keyof AppSettings, value: '0' | '1') => {
    setSaving(true);
    setError('');
    try {
      await settingsService.updateSettings({ [key]: value });
      onSettingsChange({ [key]: value });
      await refreshSettings();
      await onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save setting');
    } finally {
      setSaving(false);
    }
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    setError('');
    setMessage('');
    try {
      const st = await urlSafetyService.refresh();
      setStatus(st);
      const warn = (st as UrlSafetyStatus & { warning?: string }).warning;
      if (warn) {
        setMessage(`Refresh finished with a warning: ${warn}`);
      } else {
        setMessage('Blocklists re-downloaded and imported into the local database.');
      }
      setDomainPage(1);
      // Status UI may briefly lock on Windows — retry load shortly
      window.setTimeout(() => {
        void loadDomains();
        void loadStatus();
      }, 400);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to force-refresh blocklists');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveAllowlist = async () => {
    setAllowlistSaving(true);
    setError('');
    try {
      const domains = allowlistText
        .split(/[\n,]+/)
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const saved = await urlSafetyService.setAllowlist(domains);
      setAllowlistText(saved.join('\n'));
      await loadStatus();
      setMessage(`Allowlist saved (${saved.length} domains).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save allowlist');
    } finally {
      setAllowlistSaving(false);
    }
  };

  const handleAddManual = async () => {
    const lines = manualText
      .split(/[\r\n,]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError('Enter at least one domain or URL to add.');
      return;
    }
    setManualSaving(true);
    setError('');
    try {
      const result = await urlSafetyService.addDomains(lines, manualCategory);
      if (result.status) setStatus(result.status);
      setManualText('');
      setMessage(
        `Added ${result.count} domain${result.count === 1 ? '' : 's'} to the manual blocklist` +
          (result.skipped?.length ? ` (${result.skipped.length} skipped)` : '') +
          '.'
      );
      setDomainSource('manual');
      setDomainPage(1);
      await loadDomains();
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add domains');
    } finally {
      setManualSaving(false);
    }
  };

  const handleDeleteRow = async (row: UrlSafetyDomainRow) => {
    const isManual = row.source === 'manual';
    const ok = window.confirm(
      isManual
        ? `Remove manual entry "${row.domain}"?`
        : `Remove "${row.domain}" from the blocklist?\n\n(This deletes the row even if it came from a feed; a force refresh may re-add feed domains.)`
    );
    if (!ok) return;
    setError('');
    try {
      const result = await urlSafetyService.deleteDomains([row.domain], true);
      if (result.status) setStatus(result.status);
      setMessage(`Deleted ${result.deleted} row${result.deleted === 1 ? '' : 's'}.`);
      await loadDomains();
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete domain');
    }
  };

  const totalDomains = status?.total_domains ?? 0;
  const sources = status?.sources ?? [];
  const totalPages = Math.max(1, Math.ceil(domainTotal / pageSize) || 1);
  const rangeFrom = domainTotal === 0 ? 0 : (domainPage - 1) * pageSize + 1;
  const rangeTo = Math.min(domainPage * pageSize, domainTotal);

  /** Compact page-number list with ellipses, e.g. 1 … 4 5 6 … 40 */
  const pageNumbers = useMemo(() => {
    const pages: Array<number | 'ellipsis'> = [];
    if (totalPages <= 9) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    const pushUnique = (n: number | 'ellipsis') => {
      if (pages.length === 0 || pages[pages.length - 1] !== n) pages.push(n);
    };
    pushUnique(1);
    const start = Math.max(2, domainPage - 2);
    const end = Math.min(totalPages - 1, domainPage + 2);
    if (start > 2) pushUnique('ellipsis');
    for (let i = start; i <= end; i++) pushUnique(i);
    if (end < totalPages - 1) pushUnique('ellipsis');
    pushUnique(totalPages);
    return pages;
  }, [domainPage, totalPages]);

  const summary = useMemo(() => {
    if (!status) return '';
    const parts = [
      `${status.total_domains.toLocaleString()} domains`,
      status.lists_ready ? 'lists ready' : 'lists not loaded',
    ];
    if (typeof status.manual_count === 'number') {
      parts.push(`${status.manual_count} manual`);
    }
    return parts.join(' · ');
  }, [status]);

  const sourceFilterOptions = useMemo(() => {
    const fromStatus = (status?.by_source || []).map((s) => s.source);
    const set = new Set<string>(['manual', ...fromStatus, ...sources.map((s) => s.id)]);
    return Array.from(set).filter(Boolean).sort();
  }, [status, sources]);

  return (
    <div className={`space-y-6 ${isMobile ? 'px-1' : ''}`}>
      {message ? (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 text-sm text-emerald-900 dark:text-emerald-100">
          {message}
          <button
            type="button"
            className="ml-3 text-xs underline opacity-80"
            onClick={() => setMessage('')}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className={ADMIN_SECTION_TITLE}>
                <span aria-hidden>🛡️</span> URL Safety Intelligence
              </h3>
              <p className={ADMIN_SECTION_SUBTITLE}>
                Local SQLite blocklists + heuristics. Checks do not visit the target URL. Force refresh
                re-downloads phishing, malware, and NSFW feeds into the database.
              </p>
              {summary ? <p className="text-xs text-sky-800/60 dark:text-sky-200/60 mt-2">{summary}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => void handleForceRefresh()}
              disabled={refreshing}
              className={`${ADMIN_PRIMARY_BTN} px-4 py-2`}
              title="Re-download all feeds and rebuild the local domain table"
            >
              {refreshing ? 'Force refreshing…' : 'Force refresh database'}
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              checked={enabled}
              disabled={saving}
              onChange={(e) => void persistToggle('url_safety_enabled', e.target.checked ? '1' : '0')}
            />
            <span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Enable URL Safety checks</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Show Safe / Malicious / Adult / Suspicious badges next to RTT and HTTPS while editing links.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              checked={checkAdult}
              disabled={saving || !enabled}
              onChange={(e) => void persistToggle('url_safety_check_adult', e.target.checked ? '1' : '0')}
            />
            <span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Check adult / NSFW domains</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Warn (does not block save) when the host matches HaGeZi NSFW.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              checked={blockMalicious}
              disabled={saving || !enabled}
              onChange={(e) => void persistToggle('url_safety_block_malicious', e.target.checked ? '1' : '0')}
            />
            <span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Hard-block malware / phishing</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                When off (default), users confirm before saving flagged URLs. When on, save and MCP writes are refused.
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Table information */}
      <CollapsibleAdminSection
        emoji="🗄️"
        title="Database table information"
        defaultOpen
        subtitle="SQLite schema, row counts, and feed breakdown for URL Safety"
      >
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Domains',
                    value: totalDomains.toLocaleString(),
                    hint: status?.lists_ready ? 'Lists ready' : 'Lists not loaded',
                    tone: 'sky' as const,
                  },
                  {
                    label: 'Tables',
                    value: String((status?.tables || []).length),
                    hint: 'url_safety_*',
                    tone: 'teal' as const,
                  },
                  {
                    label: 'Allowlist',
                    value: String(status?.allowlist_count ?? 0),
                    hint: 'Never flagged',
                    tone: 'emerald' as const,
                  },
                  {
                    label: 'Manual',
                    value: String(status?.manual_count ?? 0),
                    hint: 'Survive refresh',
                    tone: 'amber' as const,
                  },
                ].map((stat) => {
                  const toneMap = {
                    sky: 'from-sky-50 to-cyan-50/80 dark:from-sky-950/50 dark:to-cyan-950/30 border-sky-200/70 dark:border-sky-800/50',
                    teal: 'from-teal-50 to-emerald-50/70 dark:from-teal-950/40 dark:to-emerald-950/25 border-teal-200/70 dark:border-teal-800/50',
                    emerald:
                      'from-emerald-50 to-green-50/70 dark:from-emerald-950/40 dark:to-green-950/25 border-emerald-200/70 dark:border-emerald-800/50',
                    amber:
                      'from-amber-50 to-orange-50/60 dark:from-amber-950/35 dark:to-orange-950/20 border-amber-200/70 dark:border-amber-800/50',
                  };
                  return (
                    <div
                      key={stat.label}
                      className={`rounded-xl border bg-gradient-to-br px-4 py-3 ${toneMap[stat.tone]}`}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {stat.label}
                      </div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white tracking-tight">
                        {stat.value}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{stat.hint}</div>
                    </div>
                  );
                })}
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Schema tables
                </h4>
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/70">
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                        <th className="py-2.5 px-4">Table</th>
                        <th className="py-2.5 px-3 w-28">Rows</th>
                        <th className="py-2.5 px-3">Columns</th>
                        <th className="py-2.5 px-4">Purpose</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {(status?.tables || []).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                            No table metadata yet — open this page after the API has initialized.
                          </td>
                        </tr>
                      ) : null}
                      {(status?.tables || []).map((t) => (
                        <tr key={t.name} className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                          <td className="py-3 px-4">
                            <code className="inline-block rounded-md bg-sky-50 dark:bg-sky-950/50 border border-sky-100 dark:border-sky-800/60 px-2 py-0.5 font-mono text-xs font-semibold text-sky-900 dark:text-sky-100">
                              {t.name}
                            </code>
                          </td>
                          <td className="py-3 px-3">
                            <span className="inline-flex min-w-[3.5rem] justify-end rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                              {t.row_count.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1 max-w-md">
                              {t.columns.map((col) => (
                                <span
                                  key={col}
                                  className="inline-block rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-slate-300"
                                >
                                  {col}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300 max-w-xs">
                            {t.purpose}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                    By category
                  </h4>
                  <div className="space-y-2">
                    {Object.entries(status?.by_category || {}).length === 0 ? (
                      <p className="text-xs text-slate-500">No domain rows yet.</p>
                    ) : null}
                    {Object.entries(status?.by_category || {}).map(([k, v]) => {
                      const pct = totalDomains > 0 ? Math.round((v / totalDomains) * 100) : 0;
                      return (
                        <div key={k} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <CategoryPill category={k} />
                            <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200">
                              {v.toLocaleString()}
                              <span className="ml-1 text-slate-400 dark:text-slate-500">{pct}%</span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-200/80 dark:bg-slate-700 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                k === 'malware'
                                  ? 'bg-rose-500'
                                  : k === 'phishing'
                                    ? 'bg-orange-500'
                                    : k === 'adult'
                                      ? 'bg-violet-500'
                                      : 'bg-sky-500'
                              }`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                    By source
                  </h4>
                  {(status?.by_source || []).length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">
                      No rows yet — use <span className="font-semibold">Force refresh database</span> to import feeds.
                    </p>
                  ) : (
                    <ul className="max-h-40 overflow-y-auto divide-y divide-slate-200/80 dark:divide-slate-700/80 -mx-1">
                      {(status?.by_source || []).map((s) => (
                        <li
                          key={s.source}
                          className="flex items-center justify-between gap-3 px-1 py-2 text-sm"
                        >
                          <code className="font-mono text-xs text-slate-700 dark:text-slate-200 truncate">
                            {s.source}
                          </code>
                          <span className="shrink-0 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-2 py-0.5 font-mono text-xs tabular-nums text-slate-800 dark:text-slate-100">
                            {s.count.toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {(status?.storage?.database || status?.storage?.cache_dir) && (
                <div className="rounded-xl border border-dashed border-sky-200/80 dark:border-sky-800/50 bg-sky-50/40 dark:bg-sky-950/20 px-4 py-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-700/80 dark:text-sky-300/80">
                    Storage
                    {status.storage?.refresh_seconds
                      ? ` · auto-refresh every ${Math.round(status.storage.refresh_seconds / 3600)}h`
                      : ''}
                  </div>
                  {status.storage?.database ? (
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 min-w-0">
                      <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400 w-16">
                        Database
                      </span>
                      <code className="text-[11px] font-mono text-slate-700 dark:text-slate-300 break-all">
                        {status.storage.database}
                      </code>
                    </div>
                  ) : null}
                  {status.storage?.cache_dir ? (
                    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 min-w-0">
                      <span className="shrink-0 text-[11px] font-semibold text-slate-500 dark:text-slate-400 w-16">
                        Cache
                      </span>
                      <code className="text-[11px] font-mono text-slate-700 dark:text-slate-300 break-all">
                        {status.storage.cache_dir}
                      </code>
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleAdminSection>

      {/* Feed sources */}
      <CollapsibleAdminSection
        emoji="📦"
        title="Blocklist sources"
        subtitle={`Downloaded feeds imported into SQLite · ${totalDomains.toLocaleString()} domains total`}
      >
        <div className="p-6 space-y-5">
          {(() => {
            const okCount = sources.filter((s) => !s.last_error && s.entry_count > 0).length;
            const errCount = sources.filter((s) => !!s.last_error).length;
            const pendingCount = sources.filter((s) => !s.last_error && s.entry_count <= 0).length;
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Feeds',
                    value: String(sources.length),
                    hint: 'Configured sources',
                    tone: 'sky' as const,
                  },
                  {
                    label: 'Healthy',
                    value: String(okCount),
                    hint: 'Imported OK',
                    tone: 'emerald' as const,
                  },
                  {
                    label: 'Pending',
                    value: String(pendingCount),
                    hint: 'Awaiting refresh',
                    tone: 'amber' as const,
                  },
                  {
                    label: 'Errors',
                    value: String(errCount),
                    hint: errCount ? 'Check last fetch' : 'None',
                    tone: errCount ? ('rose' as const) : ('teal' as const),
                  },
                ].map((stat) => {
                  const toneMap = {
                    sky: 'from-sky-50 to-cyan-50/80 dark:from-sky-950/50 dark:to-cyan-950/30 border-sky-200/70 dark:border-sky-800/50',
                    teal: 'from-teal-50 to-emerald-50/70 dark:from-teal-950/40 dark:to-emerald-950/25 border-teal-200/70 dark:border-teal-800/50',
                    emerald:
                      'from-emerald-50 to-green-50/70 dark:from-emerald-950/40 dark:to-green-950/25 border-emerald-200/70 dark:border-emerald-800/50',
                    amber:
                      'from-amber-50 to-orange-50/60 dark:from-amber-950/35 dark:to-orange-950/20 border-amber-200/70 dark:border-amber-800/50',
                    rose: 'from-rose-50 to-red-50/70 dark:from-rose-950/40 dark:to-red-950/25 border-rose-200/70 dark:border-rose-800/50',
                  };
                  return (
                    <div
                      key={stat.label}
                      className={`rounded-xl border bg-gradient-to-br px-4 py-3 ${toneMap[stat.tone]}`}
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {stat.label}
                      </div>
                      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white tracking-tight">
                        {stat.value}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{stat.hint}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Feed status
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/70">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2.5 px-4">Source</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 w-28">Entries</th>
                    <th className="py-2.5 px-3">Last fetch</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {sources.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                        No feed definitions loaded.
                      </td>
                    </tr>
                  ) : null}
                  {sources.map((src) => (
                    <tr key={src.id} className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{src.label}</div>
                        <code className="mt-0.5 inline-block text-[10px] font-mono text-slate-400 dark:text-slate-500">
                          {src.id}
                        </code>
                      </td>
                      <td className="py-3 px-3">
                        <CategoryPill category={src.category} />
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex min-w-[3.5rem] justify-end rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                          {src.entry_count.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatFetchedAt(src.fetched_at)}
                      </td>
                      <td className="py-3 px-4">
                        {src.last_error ? (
                          <span
                            className="inline-flex rounded-md border border-rose-200/80 dark:border-rose-800/60 bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200 px-2 py-0.5 text-xs font-semibold"
                            title={src.last_error}
                          >
                            Error
                          </span>
                        ) : src.entry_count > 0 ? (
                          <span className="inline-flex rounded-md border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200 px-2 py-0.5 text-xs font-semibold">
                            OK
                          </span>
                        ) : (
                          <span className="inline-flex rounded-md border border-amber-200/80 dark:border-amber-800/60 bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200 px-2 py-0.5 text-xs font-semibold">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {status?.attribution?.length ? (
            <div className="rounded-xl border border-dashed border-sky-200/80 dark:border-sky-800/50 bg-sky-50/40 dark:bg-sky-950/20 px-4 py-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-700/80 dark:text-sky-300/80">
                Attribution
              </div>
              {status.attribution.map((line) => (
                <p key={line} className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </CollapsibleAdminSection>

      {/* Manual add */}
      <CollapsibleAdminSection
        emoji="➕"
        title="Add domains manually"
        subtitle="Custom blocklist entries that survive feed refresh · one domain or URL per line"
      >
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-gradient-to-br from-sky-50 to-cyan-50/80 dark:from-sky-950/50 dark:to-cyan-950/30 border-sky-200/70 dark:border-sky-800/50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Manual entries
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white tracking-tight">
                {(status?.manual_count ?? 0).toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">source = manual</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Tips
              </div>
              <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 list-disc list-inside">
                <li>Bare domains or full URLs accepted</li>
                <li>Not overwritten by force refresh</li>
                <li>Delete later from the domain browser</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Category
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'malware' as const, label: 'Malware' },
                    { id: 'phishing' as const, label: 'Phishing' },
                    { id: 'adult' as const, label: 'Adult' },
                  ] as const
                ).map((opt) => {
                  const selected = manualCategory === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setManualCategory(opt.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                        selected
                          ? categoryBadgeClass(opt.id)
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Domains / URLs
              </span>
              <textarea
                className={`${ADMIN_FIELD} mt-2 min-h-[140px] font-mono text-xs`}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={'bad-example.com\nhttps://phish.example.org/login\n203.0.113.10'}
                spellCheck={false}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Selected: <CategoryPill category={manualCategory} />
              </p>
              <button
                type="button"
                onClick={() => void handleAddManual()}
                disabled={manualSaving || !manualText.trim()}
                className={`${ADMIN_PRIMARY_BTN} px-4 py-2`}
              >
                {manualSaving ? 'Adding…' : 'Add to blocklist'}
              </button>
            </div>
          </div>
        </div>
      </CollapsibleAdminSection>

      {/* Browse table */}
      <CollapsibleAdminSection
        emoji="📋"
        title="Domain table browser"
        subtitle={`Search and page through url_safety_domains${domainTotal ? ` · ${domainTotal.toLocaleString()} matching` : ''}`}
      >
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border bg-gradient-to-br from-sky-50 to-cyan-50/80 dark:from-sky-950/50 dark:to-cyan-950/30 border-sky-200/70 dark:border-sky-800/50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Matching
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white tracking-tight">
                {domainTotal.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Current filters</div>
            </div>
            <div className="rounded-xl border bg-gradient-to-br from-teal-50 to-emerald-50/70 dark:from-teal-950/40 dark:to-emerald-950/25 border-teal-200/70 dark:border-teal-800/50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Page
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white tracking-tight">
                {domainPage}
                <span className="text-base font-semibold text-slate-400 dark:text-slate-500"> / {totalPages}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{pageSize} per page</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-3 col-span-2 lg:col-span-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Showing
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                {domainTotal === 0
                  ? 'No rows'
                  : `${rangeFrom.toLocaleString()}–${rangeTo.toLocaleString()}`}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Of filtered results</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Filters
            </h4>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex-1 min-w-[12rem] text-xs font-semibold text-slate-600 dark:text-slate-400">
                Search
                <input
                  className={`${ADMIN_FIELD} mt-1`}
                  value={domainQ}
                  onChange={(e) => {
                    setDomainPage(1);
                    setDomainQ(e.target.value);
                  }}
                  placeholder="Filter by domain…"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Category
                <select
                  className={`${ADMIN_FIELD} mt-1 w-36`}
                  value={domainCategory}
                  onChange={(e) => {
                    setDomainPage(1);
                    setDomainCategory(e.target.value);
                  }}
                >
                  <option value="">All</option>
                  <option value="malware">Malware</option>
                  <option value="phishing">Phishing</option>
                  <option value="adult">Adult</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Source
                <select
                  className={`${ADMIN_FIELD} mt-1 w-44`}
                  value={domainSource}
                  onChange={(e) => {
                    setDomainPage(1);
                    setDomainSource(e.target.value);
                  }}
                >
                  <option value="">All</option>
                  {sourceFilterOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Rows
                <select
                  className={`${ADMIN_FIELD} mt-1 w-28`}
                  value={pageSize}
                  onChange={(e) => {
                    setDomainPage(1);
                    setPageSize(Number(e.target.value) || 50);
                  }}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`${ADMIN_SECONDARY_BTN} px-3 py-2.5`}
                onClick={() => void loadDomains()}
                disabled={domainsLoading}
              >
                {domainsLoading ? 'Loading…' : 'Reload'}
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Domains
            </h4>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/70">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                    <th className="py-2.5 px-4">Domain</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Source</th>
                    <th className="py-2.5 px-4 w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {domainRows.length === 0 && !domainsLoading ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-500 text-sm">
                        No domains match these filters.
                      </td>
                    </tr>
                  ) : null}
                  {domainRows.map((row) => (
                    <tr
                      key={`${row.source}:${row.domain}`}
                      className="align-top hover:bg-slate-50/80 dark:hover:bg-slate-900/40"
                    >
                      <td className="py-3 px-4">
                        <code className="font-mono text-xs text-slate-800 dark:text-slate-100 break-all">
                          {row.domain}
                        </code>
                      </td>
                      <td className="py-3 px-3">
                        <CategoryPill category={row.category} />
                      </td>
                      <td className="py-3 px-3">
                        <code className="inline-block rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                          {row.source}
                        </code>
                        {row.source === 'manual' ? (
                          <span className="ml-1.5 inline-flex rounded-md border border-sky-200/80 dark:border-sky-800/60 bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200 px-1.5 py-0.5 text-[10px] font-semibold">
                            manual
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          className="inline-flex rounded-md border border-rose-200/80 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:text-rose-300 dark:hover:bg-rose-950/70 transition-colors"
                          onClick={() => void handleDeleteRow(row)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>
                {domainTotal === 0
                  ? 'No rows'
                  : `Showing ${rangeFrom.toLocaleString()}–${rangeTo.toLocaleString()} of ${domainTotal.toLocaleString()}`}
                <span className="text-slate-400 dark:text-slate-500">
                  {' '}
                  · {pageSize} per page · Page {domainPage} of {totalPages}
                </span>
              </span>
              <label className="inline-flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-400">
                Rows
                <select
                  className="bg-white dark:bg-slate-900/50 border border-sky-200/70 dark:border-sky-800/40 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                  value={pageSize}
                  onChange={(e) => {
                    setDomainPage(1);
                    setPageSize(Number(e.target.value) || 50);
                  }}
                  aria-label="Rows per page"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                disabled={domainPage <= 1 || domainsLoading}
                onClick={() => setDomainPage(1)}
                title="First page"
              >
                «
              </button>
              <button
                type="button"
                className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                disabled={domainPage <= 1 || domainsLoading}
                onClick={() => setDomainPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              {pageNumbers.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span
                    key={`e-${idx}`}
                    className="px-1.5 text-slate-400 dark:text-slate-500 select-none"
                    aria-hidden
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    disabled={domainsLoading}
                    onClick={() => setDomainPage(item)}
                    className={`min-w-[2rem] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      item === domainPage
                        ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/20'
                        : `${ADMIN_SECONDARY_BTN}`
                    }`}
                    aria-current={item === domainPage ? 'page' : undefined}
                  >
                    {item}
                  </button>
                )
              )}
              <button
                type="button"
                className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                disabled={domainPage >= totalPages || domainsLoading}
                onClick={() => setDomainPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
              <button
                type="button"
                className={`${ADMIN_SECONDARY_BTN} px-3 py-1.5`}
                disabled={domainPage >= totalPages || domainsLoading}
                onClick={() => setDomainPage(totalPages)}
                title="Last page"
              >
                »
              </button>
            </div>
          </div>
        </div>
      </CollapsibleAdminSection>

      <CollapsibleAdminSection
        emoji="✅"
        title="Allowlist"
        subtitle="Trusted hosts that should never be flagged · parent domains also match"
      >
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-green-50/70 dark:from-emerald-950/40 dark:to-green-950/25 border-emerald-200/70 dark:border-emerald-800/50 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Allowlist
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white tracking-tight">
                {(status?.allowlist_count ?? 0).toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Never flagged</div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                How it works
              </div>
              <ul className="text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5 list-disc list-inside">
                <li>One hostname per line</li>
                <li>Parents cover subdomains</li>
                <li>Overrides malware / phishing / adult hits</li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-4 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Trusted domains
              </span>
              <textarea
                className={`${ADMIN_FIELD} mt-2 min-h-[160px] font-mono text-xs`}
                value={allowlistText}
                onChange={(e) => setAllowlistText(e.target.value)}
                placeholder={'example.com\ntrusted.partner.org'}
                spellCheck={false}
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Saving replaces the full allowlist with the text above.
              </p>
              <button
                type="button"
                onClick={() => void handleSaveAllowlist()}
                disabled={allowlistSaving}
                className={`${ADMIN_PRIMARY_BTN} px-4 py-2`}
              >
                {allowlistSaving ? 'Saving…' : 'Save allowlist'}
              </button>
            </div>
          </div>
        </div>
      </CollapsibleAdminSection>
    </div>
  );
};
