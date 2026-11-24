import React, { useMemo, useState } from 'react';
import { stripHtmlToPlainText } from '../utils/richTextDisplay';
import { linkHealthService, type TooltipInventoryItem } from '../services/linkHealthService';

const ADMIN_SECTION_CARD =
  'bg-white dark:bg-slate-800 border border-sky-200/70 dark:border-sky-800/40 rounded-xl overflow-hidden shadow-sm shadow-sky-500/5';
const ADMIN_SECTION_HEADER =
  'bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 border-b border-sky-100 dark:border-sky-800/40 px-6 py-5';
const ADMIN_SECTION_TITLE =
  'text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2';
const ADMIN_SECTION_SUBTITLE = 'text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5';
const ADMIN_PRIMARY_BTN =
  'bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shadow-sky-500/20';

interface TooltipSyncAdminProps {
  isMobile?: boolean;
  setError: (msg: string) => void;
}

export const TooltipSyncAdmin: React.FC<TooltipSyncAdminProps> = ({ isMobile, setError }) => {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [rows, setRows] = useState<TooltipInventoryItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [scanCounts, setScanCounts] = useState({ scanned: 0, mismatched: 0, empty: 0 });

  const issues = useMemo(
    () =>
      rows.filter((row) => {
        if (!includeEmpty && row.reason === 'empty') return false;
        const q = filter.trim().toLowerCase();
        if (!q) return true;
        return (
          stripHtmlToPlainText(row.label).toLowerCase().includes(q) ||
          stripHtmlToPlainText(row.tooltip).toLowerCase().includes(q) ||
          row.url.toLowerCase().includes(q) ||
          row.tileTitle.toLowerCase().includes(q) ||
          row.suggestedTooltip.toLowerCase().includes(q)
        );
      }),
    [rows, filter, includeEmpty]
  );

  const selectedRows = issues.filter((row) => selected.has(row.id));

  const handleScan = async () => {
    setLoading(true);
    setError('');
    setResultMessage('');
    try {
      const result = await linkHealthService.getTooltipInventory();
      setRows(result.items);
      setScanCounts({
        scanned: result.scanned,
        mismatched: result.mismatched,
        empty: result.empty,
      });
      const defaultSelected = result.items.filter((row) => row.reason === 'mismatch').map((row) => row.id);
      setSelected(new Set(defaultSelected));
      setScanned(true);
      if (result.mismatched === 0 && result.empty === 0) {
        setResultMessage(`Scanned ${result.scanned} link${result.scanned === 1 ? '' : 's'}. All tooltips already match the link name.`);
      } else {
        setResultMessage(
          `Scanned ${result.scanned} link${result.scanned === 1 ? '' : 's'}. Found ${result.mismatched} tooltip${result.mismatched === 1 ? '' : 's'} that differ from the link name${result.empty ? `, plus ${result.empty} empty` : ''}.`
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to scan tooltips');
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleVisible = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of issues) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  };

  const applyChanges = async (targets: TooltipInventoryItem[]) => {
    const ids = targets.map((row) => row.id);
    if (ids.length === 0) {
      setError('No links selected');
      return;
    }
    setApplying(true);
    setError('');
    try {
      const result = await linkHealthService.syncTooltips(ids);
      const applyMsg = `Updated ${result.updated} tooltip${result.updated === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} skipped)` : ''}.`;
      await handleScan();
      setResultMessage(applyMsg);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sync tooltips');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h2 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>💬</span>
            Sync Tooltips
          </h2>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Find hover tooltips that do not match the link name (for example after a rename)
            and copy the current name onto the selected tooltips. Custom descriptions you want
            to keep can be left unchecked.
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
              {loading ? 'Scanning…' : scanned ? 'Scan again' : 'Scan all tooltips'}
            </button>
            <button
              type="button"
              className={`${ADMIN_PRIMARY_BTN} px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500`}
              onClick={() => void applyChanges(selectedRows)}
              disabled={applying || loading || selectedRows.length === 0}
            >
              {applying ? 'Applying…' : `Sync selected (${selectedRows.length})`}
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-sky-700 hover:text-sky-600 disabled:opacity-50 dark:text-sky-300"
              onClick={() => void applyChanges(issues)}
              disabled={applying || loading || issues.length === 0}
            >
              Sync all shown
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
                  placeholder="Filter by name, tooltip, URL, or space…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  disabled={loading || applying}
                />
                <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    checked={includeEmpty}
                    onChange={(e) => setIncludeEmpty(e.target.checked)}
                  />
                  Include empty tooltips ({scanCounts.empty})
                </label>
              </div>

              {issues.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                  {includeEmpty
                    ? 'No tooltip mismatches match this filter.'
                    : 'No leftover tooltips that differ from the link name.'}
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
                            checked={issues.length > 0 && issues.every((row) => selected.has(row.id))}
                            onChange={(e) => toggleVisible(e.target.checked)}
                            disabled={issues.length === 0}
                            aria-label="Select all shown tooltip updates"
                          />
                        </th>
                        <th className="px-3 py-3 font-semibold">Link name</th>
                        <th className="px-3 py-3 font-semibold">Current tooltip</th>
                        <th className="px-3 py-3 font-semibold">Will become</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issues.map((row) => (
                        <tr
                          key={row.id}
                          className="border-t border-sky-100/80 dark:border-sky-900/40 align-top hover:bg-sky-50/40 dark:hover:bg-sky-950/20"
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                              checked={selected.has(row.id)}
                              onChange={(e) => toggleRow(row.id, e.target.checked)}
                              aria-label={`Select ${stripHtmlToPlainText(row.label) || row.url}`}
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {stripHtmlToPlainText(row.label) || '(untitled)'}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {row.tileEmoji ? `${row.tileEmoji} ` : ''}
                              {row.tileTitle || 'Untitled space'}
                              {row.tabTitle ? ` · ${row.tabTitle}` : ''}
                              {row.sectionTitle ? ` · ${row.sectionTitle}` : ''}
                              {row.sourceTab === 'staging' ? ' · staging' : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-amber-800 dark:text-amber-200 break-words">
                            {row.reason === 'empty' ? (
                              <span className="italic text-slate-400 dark:text-slate-500">(empty)</span>
                            ) : (
                              stripHtmlToPlainText(row.tooltip) || '(empty)'
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-emerald-800 dark:text-emerald-200 break-words">
                            {row.suggestedTooltip}
                          </td>
                        </tr>
                      ))}
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
