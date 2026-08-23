import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  categoryPresetService,
  downloadCategoryPresetsJson,
  parseCategoryPresetsImportFile,
  type DbCategoryPreset,
} from '../services/categoryPresetService';

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

const TAB_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'your-apps', label: 'Your Apps' },
  { value: 'staging', label: 'Staging' },
  { value: 'private', label: 'Private' },
  { value: 'public-favorites', label: 'Public Favorites' },
];

function parseVisibleLines(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/[\n,]+/)) {
    const name = line.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= 200) break;
  }
  return out;
}

interface CategoryPresetsAdminProps {
  setError: (msg: string) => void;
}

export const CategoryPresetsAdmin: React.FC<CategoryPresetsAdminProps> = ({ setError }) => {
  const [presets, setPresets] = useState<DbCategoryPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tabKey, setTabKey] = useState('public');
  const [name, setName] = useState('');
  const [visibleText, setVisibleText] = useState('');
  const [filterTab, setFilterTab] = useState<string>('all');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await categoryPresetService.listBuiltin();
      setPresets(data.presets);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load built-in category presets');
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filterTab === 'all') return presets;
    return presets.filter((p) => p.tab_key === filterTab);
  }, [presets, filterTab]);

  const resetForm = () => {
    setEditingId(null);
    setTabKey('public');
    setName('');
    setVisibleText('');
  };

  const startEdit = (preset: DbCategoryPreset) => {
    setEditingId(preset.id);
    setTabKey(preset.tab_key || 'public');
    setName(preset.name);
    setVisibleText((preset.visible || []).join('\n'));
  };

  const handleSave = async () => {
    const trimmed = name.trim().slice(0, 60);
    const visible = parseVisibleLines(visibleText);
    if (!trimmed) {
      setError('Preset name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await categoryPresetService.updateBuiltin(editingId, {
          tab_key: tabKey,
          name: trimmed,
          visible,
        });
      } else {
        await categoryPresetService.saveBuiltin(tabKey, trimmed, visible);
      }
      resetForm();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save built-in preset');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset: DbCategoryPreset) => {
    if (!confirm(`Delete built-in preset "${preset.name}"? Guests will no longer see it.`)) return;
    setSaving(true);
    setError('');
    try {
      await categoryPresetService.removeBuiltin(preset.id);
      if (editingId === preset.id) resetForm();
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete built-in preset');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const rows = presets.map((p) => ({
      tab_key: p.tab_key,
      name: p.name,
      visible: Array.isArray(p.visible) ? p.visible : [],
    }));
    if (rows.length === 0) {
      setError('Nothing to export — add a built-in preset first.');
      return;
    }
    downloadCategoryPresetsJson(rows, 'builtin');
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { scope, presets: incoming } = parseCategoryPresetsImportFile(parsed);
      if (scope === 'user') {
        const ok = confirm(
          'This file looks like personal (browser/user) presets. Import them as built-in admin presets anyway?'
        );
        if (!ok) return;
      }
      for (const item of incoming) {
        await categoryPresetService.saveBuiltin(item.tab_key, item.name, item.visible);
      }
      await load();
      alert(`Imported ${incoming.length} built-in preset${incoming.length === 1 ? '' : 's'}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import category presets');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <h2 className={ADMIN_SECTION_TITLE}>
            <span aria-hidden>📌</span>
            Category Presets (Built-in)
          </h2>
          <p className={ADMIN_SECTION_SUBTITLE}>
            Shared presets stored in the database. Guests and users can switch to them, but only admins can change them.
            Personal presets stay in each browser (guests) or user account.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Tab</label>
              <select
                value={tabKey}
                onChange={(e) => setTabKey(e.target.value)}
                className={ADMIN_FIELD}
              >
                {TAB_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Preset name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="e.g. ARCHTEAM"
                className={ADMIN_FIELD}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Visible categories (one per line)
            </label>
            <textarea
              value={visibleText}
              onChange={(e) => setVisibleText(e.target.value)}
              rows={6}
              placeholder={'Business IT\nNetworking\nERP'}
              className={`${ADMIN_FIELD} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Category names must match the names shown on that tab (case-sensitive).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim()}
              className={`px-4 py-2 ${ADMIN_PRIMARY_BTN}`}
            >
              {editingId ? 'Update built-in' : 'Add built-in'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600"
              >
                Cancel edit
              </button>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={saving || importing || presets.length === 0}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-50"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving || importing}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import JSON'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file);
              }}
            />
          </div>
        </div>
      </div>

      <div className={ADMIN_SECTION_CARD}>
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Built-in presets ({filtered.length})
          </h3>
          <select
            value={filterTab}
            onChange={(e) => setFilterTab(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          >
            <option value="all">All tabs</option>
            {TAB_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              No built-in presets yet. Add one above.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {filtered.map((preset) => (
                <li key={preset.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-white">{preset.name}</span>
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {TAB_OPTIONS.find((t) => t.value === preset.tab_key)?.label || preset.tab_key}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {preset.visible.length} categor{preset.visible.length === 1 ? 'y' : 'ies'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate max-w-xl">
                      {(preset.visible || []).join(', ') || '(none visible)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(preset)}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg border border-sky-200 dark:border-sky-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(preset)}
                      disabled={saving}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
