import React, { useMemo, useState } from 'react';
import { diagnoseLinkUrl, hasBlockingUrlIssues, type UrlDiagnosis } from '../utils/urlDiagnostics';
import { linkHealthService, type UrlInventoryItem } from '../services/linkHealthService';

const ADMIN_SECTION_CARD =
  'bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5';
const ADMIN_SECTION_HEADER =
  'bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5';
const ADMIN_SECTION_TITLE =
  'text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2';
const ADMIN_SECTION_SUBTITLE = 'text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5';
const ADMIN_PRIMARY_BTN =
  'bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-sky-500/20';

type ScanRow = UrlInventoryItem & {
  diagnosis: UrlDiagnosis;
  key: string;
};

interface UrlScanFixAdminProps {
  isMobile?: boolean;
  setError: (msg: string) => void;
}

const stripHtml = (value: string): string => String(value || '').replace(/<[^>]*>/g, '').trim();

export const UrlScanFixAdmin: React.FC<UrlScanFixAdminProps> = ({ isMobile, setError }) => {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [onlyFixable, setOnlyFixable] = useState(true);
  const [resultMessage, setResultMessage] = useState('');

  const issues = useMemo(
    () =>
      rows.filter((row) => {
        if (!hasBlockingUrlIssues(row.diagnosis)) return false;
        if (onlyFixable && !row.diagnosis.suggestedUrl) return false;
        const q = filter.trim().toLowerCase();
        if (!q) return true;
        return (
          row.label.toLowerCase().includes(q) ||
          row.url.toLowerCase().includes(q) ||
          row.tileTitle.toLowerCase().includes(q) ||
          (row.diagnosis.suggestedUrl || '').toLowerCase().includes(q)
        );
      }),
    [rows, filter, onlyFixable]
  );

  const fixableVisible = issues.filter((row) => !!row.diagnosis.suggestedUrl);
  const selectedFixable = fixableVisible.filter((row) => selected.has(row.key));

  const handleScan = async () => {
    setLoading(true);
    setError('');
    setResultMessage('');
    try {
      const items = await linkHealthService.getUrlInventory();
      const next: ScanRow[] = items.map((item) => ({
        ...item,
        diagnosis: diagnoseLinkUrl(item.url || ''),
        key: `${item.kind}:${item.id}`,
      }));
      setRows(next);
      setSelected(
        new Set(
          next
            .filter((row) => hasBlockingUrlIssues(row.diagnosis) && row.diagnosis.suggestedUrl)
            .map((row) => row.key)
        )
      );
      setScanned(true);
      const broken = next.filter((row) => hasBlockingUrlIssues(row.diagnosis)).length;
      const fixable = next.filter((row) => row.diagnosis.suggestedUrl).length;
      setResultMessage(
        broken === 0
          ? `Scanned ${next.length} URL${next.length === 1 ? '' : 's'}. None need fixing.`
          : `Scanned ${next.length} URL${next.length === 1 ? '' : 's'}. Found ${broken} invalid, ${fixable} with a suggested fix.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to scan URLs');
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (key: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleVisible = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of fixableVisible) {
        if (checked) next.add(row.key);
        else next.delete(row.key);
      }
      return next;
    });
  };

  const applyChanges = async (targets: ScanRow[]) => {
    const changes = targets
      .filter((row) => row.diagnosis.suggestedUrl && row.diagnosis.suggestedUrl !== row.url)
      .map((row) => ({
        id: row.id,
        url: row.diagnosis.suggestedUrl as string,
        kind: row.kind,
      }));
    if (changes.length === 0) {
      setError('No suggested fixes selected');
      return;
    }
    setApplying(true);
    setError('');
    try {
      const result = await linkHealthService.fixUrls(changes);
      const applyMsg = `Updated ${result.updated} URL${result.updated === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} skipped)` : ''}.`;
      await handleScan();
      setResultMessage(applyMsg);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply URL fixes');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h2 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>🔧</span>
            Scan &amp; Fix URLs
          </h2>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Find mashed or invalid link URLs (for example workday+https://…) and apply the suggested
            website address across all spaces at once.
          </p>
        </div>

        <div className={`p-6 space-y-5 ${isMobile ? 'px-4' : ''}`}>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`${ADMIN_PRIMARY_BTN} px-4 py-2.5`}
              onClick={() => void handleScan()}
              disabled={loading || applying}
            >
              {loading ? 'Scanning…' : scanned ? 'Scan again' : 'Scan all URLs'}
            </button>
            <button
              type="button"
              className={`${ADMIN_PRIMARY_BTN} px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500`}
              onClick={() => void applyChanges(selectedFixable)}
              disabled={applying || loading || selectedFixable.length === 0}
            >
              {applying
                ? 'Applying…'
                : `Fix selected (${selectedFixable.length})`}
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-sky-700 hover:text-sky-600 disabled:opacity-50 dark:text-sky-300"
              onClick={() => void applyChanges(fixableVisible)}
              disabled={applying || loading || fixableVisible.length === 0}
            >
              Fix all suggested
            </button>
          </div>

          {resultMessage && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{resultMessage}</p>
          )}

          {scanned && (
            <>
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <input
                  type="search"
                  className="w-full max-w-md bg-slate-50 dark:bg-slate-900/50 border border-sky-200/70 dark:border-sky-800/40 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                  placeholder="Filter by label, URL, or space…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  disabled={loading || applying}
                />
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    checked={onlyFixable}
                    onChange={(e) => setOnlyFixable(e.target.checked)}
                  />
                  Only show URLs with a suggested fix
                </label>
              </div>

              {issues.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                  {onlyFixable
                    ? 'No suggested URL fixes in this scan.'
                    : 'No invalid URLs match this filter.'}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-sky-100 dark:border-sky-900/40">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-sky-50/80 dark:bg-sky-950/30 text-left text-slate-600 dark:text-slate-300">
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            checked={
                              fixableVisible.length > 0 &&
                              fixableVisible.every((row) => selected.has(row.key))
                            }
                            onChange={(e) => toggleVisible(e.target.checked)}
                            disabled={fixableVisible.length === 0}
                            aria-label="Select all suggested fixes"
                          />
                        </th>
                        <th className="px-3 py-3 font-semibold">Link</th>
                        <th className="px-3 py-3 font-semibold">Current URL</th>
                        <th className="px-3 py-3 font-semibold">Issue</th>
                        <th className="px-3 py-3 font-semibold">Suggested URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issues.map((row) => {
                        const canFix = !!row.diagnosis.suggestedUrl;
                        const issueTitle =
                          row.diagnosis.issues.find((item) => item.severity === 'error')?.title ||
                          'Invalid URL';
                        return (
                          <tr
                            key={row.key}
                            className="border-t border-sky-100/80 dark:border-sky-900/40 align-top hover:bg-sky-50/40 dark:hover:bg-sky-950/20"
                          >
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                checked={selected.has(row.key)}
                                disabled={!canFix}
                                onChange={(e) => toggleRow(row.key, e.target.checked)}
                                aria-label={`Select ${stripHtml(row.label) || row.url}`}
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-medium text-slate-900 dark:text-white">
                                {stripHtml(row.label) || '(untitled)'}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {row.tileEmoji ? `${row.tileEmoji} ` : ''}
                                {row.tileTitle || 'Untitled space'}
                                {row.tabTitle ? ` · ${row.tabTitle}` : ''}
                                {row.sectionTitle ? ` · ${row.sectionTitle}` : ''}
                                {row.kind === 'hyperlink' ? ' · hyperlink space' : ''}
                                {row.sourceTab === 'staging' ? ' · staging' : ''}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-amber-800 dark:text-amber-200 break-all">
                              {row.url}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200">
                              {issueTitle}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-emerald-800 dark:text-emerald-200 break-all">
                              {row.diagnosis.suggestedUrl || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
