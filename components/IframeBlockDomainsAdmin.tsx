import React, { useMemo, useState } from 'react';
import {
  iframeBlockDomainsToSettingValue,
  MAX_IFRAME_BLOCK_DOMAINS,
  parseIframeBlockDomainPatterns,
  parseIframeBlockDomainsSetting,
} from '../services/iframeBlockDomainsService';
import { settingsService, type AppSettings } from '../services/settingsService';

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

interface IframeBlockDomainsAdminProps {
  settings: AppSettings;
  onSettingsChange: (partial: Partial<AppSettings>) => void;
  onRefresh: () => Promise<void>;
  isMobile?: boolean;
  setError: (msg: string) => void;
}

export const IframeBlockDomainsAdmin: React.FC<IframeBlockDomainsAdminProps> = ({
  settings,
  onSettingsChange,
  onRefresh,
  isMobile,
  setError,
}) => {
  const [saving, setSaving] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [filter, setFilter] = useState('');

  const domains = useMemo(
    () => parseIframeBlockDomainsSetting(settings.iframe_block_domains),
    [settings.iframe_block_domains]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return domains;
    return domains.filter((d) => d.toLowerCase().includes(q));
  }, [domains, filter]);

  const persist = async (next: string[], message: string) => {
    if (next.length > MAX_IFRAME_BLOCK_DOMAINS) {
      setError(`Maximum ${MAX_IFRAME_BLOCK_DOMAINS} domains allowed`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        iframe_block_domains: iframeBlockDomainsToSettingValue(next),
      };
      await settingsService.updateSettings(payload);
      onSettingsChange(payload);
      await onRefresh();
      alert(message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save iframe block domains';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBulk = async () => {
    const incoming = parseIframeBlockDomainPatterns(bulkText);
    if (incoming.length === 0) {
      setError('Enter at least one hostname or domain (one per line)');
      return;
    }
    const merged = parseIframeBlockDomainPatterns([...domains, ...incoming]);
    const added = merged.length - domains.length;
    if (added <= 0) {
      setError('No new domains to add (duplicates ignored)');
      return;
    }
    await persist(
      merged,
      `Added ${added} domain${added === 1 ? '' : 's'} (${merged.length} total)`
    );
    setBulkText('');
  };

  const handleRemove = async (pattern: string) => {
    const next = domains.filter((d) => d !== pattern);
    await persist(next, 'Domain removed');
  };

  const handleClearAll = async () => {
    if (domains.length === 0) return;
    if (
      !confirm(
        `Remove all ${domains.length} iframe block domain${domains.length === 1 ? '' : 's'}?`
      )
    ) {
      return;
    }
    await persist([], 'All iframe block domains cleared');
  };

  const previewCount = useMemo(() => parseIframeBlockDomainPatterns(bulkText).length, [bulkText]);

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h2 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>🖼️</span>
            Iframe Block Domains
          </h2>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Hosts listed here skip the in-app mobile preview iframe and show the same fallback as
            Google (Device emulation / New tab). Built-in blockers (Google, SharePoint, etc.) still
            apply. Add extra hosts your org needs.
          </p>
        </div>

        <div className={`p-6 space-y-6 ${isMobile ? 'px-4' : ''}`}>
          <div className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-gradient-to-br from-sky-50/40 to-white dark:from-sky-950/20 dark:to-slate-800 p-4 space-y-3">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Add domains (bulk)
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              One hostname per line (e.g. intranet.corp.local or *.apps.example.com). Pasted URLs
              keep only the hostname. Duplicates are ignored.
            </p>
            <textarea
              className={`${ADMIN_FIELD} font-mono min-h-[140px] resize-y`}
              placeholder={`intranet.example.com\n*.apps.corp.local\nhttps://portal.example.com/path`}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              disabled={saving}
              spellCheck={false}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={`${ADMIN_PRIMARY_BTN} px-4 py-2.5`}
                onClick={() => void handleAddBulk()}
                disabled={saving || previewCount === 0}
              >
                {saving ? 'Saving…' : `Add ${previewCount || ''} domain${previewCount === 1 ? '' : 's'}`.trim()}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {domains.length} / {MAX_IFRAME_BLOCK_DOMAINS} stored
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 justify-between">
            <input
              type="search"
              className={`${ADMIN_FIELD} max-w-md`}
              placeholder="Filter domains…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              disabled={saving}
            />
            <button
              type="button"
              className="text-sm font-semibold text-red-600 hover:text-red-500 disabled:opacity-50 dark:text-red-400"
              onClick={() => void handleClearAll()}
              disabled={saving || domains.length === 0}
            >
              Clear all
            </button>
          </div>

          {domains.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              No custom domains yet. Built-in blockers still apply; add hosts above for sites that
              need the mobile preview fallback.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-sky-100 dark:border-sky-900/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sky-50/80 dark:bg-sky-950/30 text-left text-slate-600 dark:text-slate-300">
                    <th className="px-4 py-3 font-semibold">Hostname / pattern</th>
                    <th className="px-4 py-3 font-semibold w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pattern) => (
                    <tr
                      key={pattern}
                      className="border-t border-sky-100/80 dark:border-sky-900/40 hover:bg-sky-50/40 dark:hover:bg-sky-950/20"
                    >
                      <td className="px-4 py-2.5 font-mono text-slate-800 dark:text-slate-100 break-all">
                        {pattern}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-500 font-semibold disabled:opacity-50 dark:text-red-400"
                          onClick={() => void handleRemove(pattern)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
                  No domains match this filter.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
