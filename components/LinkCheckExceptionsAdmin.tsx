import React, { useEffect, useMemo, useState } from 'react';
import {
  exceptionsToSettingValue,
  MAX_LINK_CHECK_EXCEPTIONS,
  parseExceptionPatterns,
  parseExceptionsSetting,
} from '../services/linkCheckExceptionsService';
import {
  DEFAULT_LINK_HEALTH_STATUS_COLORS,
  DEFAULT_LINK_HEALTH_STATUS_SHAPE,
  LINK_HEALTH_COLOR_LABELS,
  LINK_HEALTH_SHAPE_OPTIONS,
  linkHealthStatusColorsToSetting,
  normalizeHealthColorHex,
  normalizeLinkHealthStatusShape,
  parseLinkHealthStatusColors,
  type LinkHealthColorKey,
  type LinkHealthIndicatorShape,
  type LinkHealthStatusColors,
} from '../services/linkHealthColors';
import { settingsService, type AppSettings } from '../services/settingsService';
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

const COLOR_KEYS = Object.keys(DEFAULT_LINK_HEALTH_STATUS_COLORS) as LinkHealthColorKey[];

interface LinkCheckExceptionsAdminProps {
  settings: AppSettings;
  onSettingsChange: (partial: Partial<AppSettings>) => void;
  onRefresh: () => Promise<void>;
  isMobile?: boolean;
  setError: (msg: string) => void;
}

export const LinkCheckExceptionsAdmin: React.FC<LinkCheckExceptionsAdminProps> = ({
  settings,
  onSettingsChange,
  onRefresh,
  isMobile,
  setError,
}) => {
  const { refreshSettings } = useSettings();
  const [saving, setSaving] = useState(false);
  const [colorsSaving, setColorsSaving] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [filter, setFilter] = useState('');
  const [healthColors, setHealthColors] = useState<LinkHealthStatusColors>(() =>
    parseLinkHealthStatusColors(settings.link_health_status_colors)
  );
  const [healthShape, setHealthShape] = useState<LinkHealthIndicatorShape>(() =>
    normalizeLinkHealthStatusShape(settings.link_health_status_shape)
  );

  useEffect(() => {
    setHealthColors(parseLinkHealthStatusColors(settings.link_health_status_colors));
  }, [settings.link_health_status_colors]);

  useEffect(() => {
    setHealthShape(normalizeLinkHealthStatusShape(settings.link_health_status_shape));
  }, [settings.link_health_status_shape]);

  const exceptions = useMemo(
    () => parseExceptionsSetting(settings.link_check_exceptions),
    [settings.link_check_exceptions]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return exceptions;
    return exceptions.filter((e) => e.toLowerCase().includes(q));
  }, [exceptions, filter]);

  const persist = async (next: string[], message: string) => {
    if (next.length > MAX_LINK_CHECK_EXCEPTIONS) {
      setError(`Maximum ${MAX_LINK_CHECK_EXCEPTIONS} exceptions allowed`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        link_check_exceptions: exceptionsToSettingValue(next),
      };
      await settingsService.updateSettings(payload);
      onSettingsChange(payload);
      await onRefresh();
      alert(message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save link check exceptions';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleAddBulk = async () => {
    const incoming = parseExceptionPatterns(bulkText);
    if (incoming.length === 0) {
      setError('Enter at least one URL or hostname (one per line)');
      return;
    }
    const merged = parseExceptionPatterns([...exceptions, ...incoming]);
    const added = merged.length - exceptions.length;
    if (added <= 0) {
      setError('No new exceptions to add (duplicates ignored)');
      return;
    }
    await persist(
      merged,
      `Added ${added} exception${added === 1 ? '' : 's'} (${merged.length} total)`
    );
    setBulkText('');
  };

  const handleRemove = async (pattern: string) => {
    const next = exceptions.filter((e) => e !== pattern);
    await persist(next, 'Exception removed');
  };

  const handleClearAll = async () => {
    if (exceptions.length === 0) return;
    if (
      !confirm(
        `Remove all ${exceptions.length} link check exception${exceptions.length === 1 ? '' : 's'}?`
      )
    ) {
      return;
    }
    await persist([], 'All link check exceptions cleared');
  };

  const updateHealthColor = (key: LinkHealthColorKey, value: string) => {
    const trimmed = value.trim();
    setHealthColors((prev) => {
      const next = { ...prev };
      if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
        next[key] = normalizeHealthColorHex(trimmed, DEFAULT_LINK_HEALTH_STATUS_COLORS[key]);
      } else if (trimmed === '' || trimmed.startsWith('#')) {
        next[key] = trimmed || DEFAULT_LINK_HEALTH_STATUS_COLORS[key];
      } else {
        next[key] = `#${trimmed}`;
      }
      return next;
    });
  };

  const handleSaveColors = async () => {
    setColorsSaving(true);
    setError('');
    try {
      const normalized = parseLinkHealthStatusColors(healthColors);
      const payload = {
        link_health_status_colors: linkHealthStatusColorsToSetting(normalized),
        link_health_status_shape: healthShape,
      };
      await settingsService.updateSettings(payload);
      setHealthColors(normalized);
      onSettingsChange(payload);
      await onRefresh();
      await refreshSettings();
      alert('Status colors saved successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save status colors';
      setError(msg);
    } finally {
      setColorsSaving(false);
    }
  };

  const handleResetColors = () => {
    setHealthColors({ ...DEFAULT_LINK_HEALTH_STATUS_COLORS });
    setHealthShape(DEFAULT_LINK_HEALTH_STATUS_SHAPE);
  };

  const previewCount = useMemo(() => parseExceptionPatterns(bulkText).length, [bulkText]);

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h2 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>🎨</span>
            Check Links Status Colors
          </h2>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Customize the colored dots next to links after Check Links runs (online, redirected,
            broken, and more). Changes apply site-wide after you save.
          </p>
          <p className="mt-2 text-xs text-amber-800/90 dark:text-amber-200/90 rounded-lg border border-amber-200/70 dark:border-amber-800/40 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 leading-relaxed">
            Many login and SSO links are labeled <strong>Unknown / Timeout</strong>, not{' '}
            <strong>Redirected</strong>, when Check Links sees a reachable host but cannot confirm a
            redirect chain. Changing <strong>Redirected</strong> alone will not recolor those dots —
            update <strong>Unknown / Timeout</strong> as well (or use the shortcut below).
          </p>
        </div>
        <div className={`p-6 space-y-4 ${isMobile ? 'px-4' : ''}`}>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
              Marker shape
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {LINK_HEALTH_SHAPE_OPTIONS.map((option) => {
                const selected = healthShape === option.id;
                const previewColor = healthColors.online;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setHealthShape(option.id)}
                    disabled={colorsSaving}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      selected
                        ? 'border-sky-400 bg-sky-50/80 dark:border-sky-500 dark:bg-sky-950/30 ring-2 ring-sky-400/40'
                        : 'border-sky-100 dark:border-sky-900/40 bg-slate-50/80 dark:bg-slate-900/40 hover:border-sky-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ${
                          option.id === 'diamond' ? 'overflow-visible' : ''
                        }`}
                      >
                        <span
                          className={
                            option.id === 'square'
                              ? 'w-3 h-3 rounded-none'
                              : option.id === 'rounded'
                                ? 'w-3 h-3 rounded-[3px]'
                                : option.id === 'diamond'
                                  ? 'w-3 h-3 rounded-[2px] rotate-45 scale-90'
                                  : 'w-3 h-3 rounded-full'
                          }
                          style={{ backgroundColor: previewColor }}
                          aria-hidden
                        />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                          {option.label}
                        </span>
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {option.description}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COLOR_KEYS.map((key) => {
              const meta = LINK_HEALTH_COLOR_LABELS[key];
              const color = healthColors[key];
              const pickerValue = /^#[0-9a-fA-F]{6}$/i.test(color)
                ? color
                : DEFAULT_LINK_HEALTH_STATUS_COLORS[key];
              return (
                <div
                  key={key}
                  className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 ring-2 ring-white dark:ring-slate-800 shadow-sm"
                      style={{ backgroundColor: pickerValue }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {meta.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {meta.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={pickerValue}
                      onChange={(e) => updateHealthColor(key, e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-slate-300 dark:border-slate-600 bg-transparent p-0.5"
                      title={`Pick ${meta.label} color`}
                      disabled={colorsSaving}
                    />
                    <input
                      type="text"
                      value={color}
                      onChange={(e) => updateHealthColor(key, e.target.value)}
                      spellCheck={false}
                      className={`${ADMIN_FIELD} font-mono text-xs`}
                      disabled={colorsSaving}
                      aria-label={`${meta.label} hex color`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              className="text-sm font-semibold text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100 disabled:opacity-50"
              onClick={() =>
                setHealthColors((prev) => ({
                  ...prev,
                  redirected: prev.online,
                  unknown: prev.online,
                }))
              }
              disabled={colorsSaving}
            >
              Copy Online color → Unknown &amp; Redirected
            </button>
            <button
              type="button"
              className={`${ADMIN_PRIMARY_BTN} px-4 py-2.5`}
              onClick={() => void handleSaveColors()}
              disabled={colorsSaving}
            >
              {colorsSaving ? 'Saving…' : 'Save Status Colors & Shape'}
            </button>
            <button
              type="button"
              className="text-sm font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white disabled:opacity-50"
              onClick={handleResetColors}
              disabled={colorsSaving}
            >
              Reset to defaults
            </button>
          </div>
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h2 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>🚫</span>
            Link Check Exceptions
          </h2>
          <p className={ADMIN_SECTION_SUBTITLE}>
            URLs and hosts listed here are skipped by Check Links and never marked Broken. Paste
            full URLs, hostnames (e.g. bi.example.com), or simple wildcards (*.internal.corp).
          </p>
        </div>

        <div className={`p-6 space-y-6 ${isMobile ? 'px-4' : ''}`}>
          <div className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-gradient-to-br from-sky-50/40 to-white dark:from-sky-950/20 dark:to-slate-800 p-4 space-y-3">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              Add exceptions (bulk)
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              One URL or hostname per line. Commas and semicolons also work. Duplicates are ignored.
            </p>
            <textarea
              className={`${ADMIN_FIELD} font-mono min-h-[140px] resize-y`}
              placeholder={`bi.example.com\nhttps://analytics.example.com/reports\n*.corp.local`}
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
                {saving ? 'Saving…' : `Add ${previewCount || ''} exception${previewCount === 1 ? '' : 's'}`.trim()}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {exceptions.length} / {MAX_LINK_CHECK_EXCEPTIONS} stored
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 justify-between">
            <input
              type="search"
              className={`${ADMIN_FIELD} max-w-md`}
              placeholder="Filter exceptions…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              disabled={saving}
            />
            <button
              type="button"
              className="text-sm font-semibold text-red-600 hover:text-red-500 disabled:opacity-50 dark:text-red-400"
              onClick={() => void handleClearAll()}
              disabled={saving || exceptions.length === 0}
            >
              Clear all
            </button>
          </div>

          {exceptions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              No exceptions yet. Add URLs or hosts above to ignore them during link checks.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-sky-100 dark:border-sky-900/40">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-sky-50/80 dark:bg-sky-950/30 text-left text-slate-600 dark:text-slate-300">
                    <th className="px-4 py-3 font-semibold">URL / Host pattern</th>
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
                  No exceptions match this filter.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
