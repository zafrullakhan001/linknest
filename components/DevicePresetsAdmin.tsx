import React, { useMemo, useRef, useState } from 'react';
import type { DeviceMockupVariant } from './DeviceMockupFrame';
import {
  DEFAULT_DEVICE_PRESETS,
  DEFAULT_QUICK_PRESETS,
  DEVICE_MOCKUP_VARIANTS,
  downloadDevicePresetsJson,
  getEffectivePresets,
  normalizePreset,
  parseImportFile,
  PRESET_GROUPS,
  suggestVariantForGroup,
  type DevicePreset,
  type DevicePresetGroup,
} from '../services/devicePresetsService';
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

interface DevicePresetsAdminProps {
  settings: AppSettings;
  onSettingsChange: (partial: Partial<AppSettings>) => void;
  onRefresh: () => Promise<void>;
  isMobile?: boolean;
  setError: (msg: string) => void;
}

export const DevicePresetsAdmin: React.FC<DevicePresetsAdminProps> = ({
  settings,
  onSettingsChange,
  onRefresh,
  isMobile,
  setError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [newId, setNewId] = useState('iphone-17');
  const [newLabel, setNewLabel] = useState('iPhone 17');
  const [newWidth, setNewWidth] = useState(402);
  const [newHeight, setNewHeight] = useState(874);
  const [newGroup, setNewGroup] = useState<DevicePresetGroup>('iPhone');
  const [newVariant, setNewVariant] = useState<DeviceMockupVariant>('iphone-island');

  const effective = useMemo(
    () =>
      getEffectivePresets({
        device_presets: settings.device_presets,
        device_quick_presets: settings.device_quick_presets,
      }),
    [settings.device_presets, settings.device_quick_presets]
  );

  const persistPresets = async (presets: DevicePreset[], quickPresets: string[], message: string) => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        device_presets: JSON.stringify(presets),
        device_quick_presets: JSON.stringify(quickPresets),
      };
      await settingsService.updateSettings(payload);
      onSettingsChange(payload);
      await onRefresh();
      alert(message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save device presets';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    downloadDevicePresetsJson(effective.presets, effective.quickPresets);
    alert('Device presets exported');
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setError('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { presets, quickPresets } = parseImportFile(parsed);
      await persistPresets(
        presets,
        quickPresets,
        `Imported ${presets.length} device preset${presets.length === 1 ? '' : 's'}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import device presets';
      setError(msg);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReset = async () => {
    if (
      !confirm(
        'Reset device presets to built-in defaults? Custom devices saved in the database will be removed.'
      )
    ) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = { device_presets: '', device_quick_presets: '' };
      await settingsService.updateSettings(payload);
      onSettingsChange(payload);
      await onRefresh();
      alert('Device presets reset to built-in defaults');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reset device presets';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleAddDevice = async () => {
    const candidate = normalizePreset(
      {
        id: newId,
        label: newLabel,
        width: newWidth,
        height: newHeight,
        group: newGroup,
        variant: newVariant,
      },
      new Set(effective.presets.map((p) => p.id))
    );
    if (!candidate) {
      setError('Invalid device fields (unique id, label, group, and variant required)');
      return;
    }
    const nextPresets = [...effective.presets, candidate];
    const nextQuick = effective.quickPresets.includes(candidate.id)
      ? effective.quickPresets
      : [...effective.quickPresets, candidate.id].slice(0, 40);
    await persistPresets(nextPresets, nextQuick, `Added ${candidate.label}`);
  };

  const handleDelete = async (id: string) => {
    if (effective.presets.length <= 1) {
      setError('Keep at least one device preset');
      return;
    }
    if (!confirm(`Remove device “${id}” from the saved catalog?`)) return;
    const nextPresets = effective.presets.filter((p) => p.id !== id);
    const nextQuick = effective.quickPresets.filter((q) => q !== id);
    await persistPresets(nextPresets, nextQuick, `Removed ${id}`);
  };

  const handleToggleQuick = async (id: string) => {
    const has = effective.quickPresets.includes(id);
    const nextQuick = has
      ? effective.quickPresets.filter((q) => q !== id)
      : [...effective.quickPresets, id].slice(0, 40);
    // Persist current preset list + updated quick list (seed defaults into DB if still defaults)
    await persistPresets(effective.presets, nextQuick, has ? `Removed ${id} from quick bar` : `Added ${id} to quick bar`);
  };

  return (
    <div className="space-y-6">
      <div className={ADMIN_SECTION_CARD}>
        <div className={ADMIN_SECTION_HEADER}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className={ADMIN_SECTION_TITLE}>
                <span aria-hidden>📱</span> Device Presets
              </h3>
              <p className={ADMIN_SECTION_SUBTITLE}>
                Manage Device Preview sizes and mockup shells. Export/import JSON to add devices like iPhone 17
                without code changes. Stored in the settings database for all users.
              </p>
              <p className="text-xs text-sky-800/60 dark:text-sky-200/60 mt-2">
                {effective.presets.length} device{effective.presets.length === 1 ? '' : 's'} ·{' '}
                {effective.isCustom ? 'Custom (saved in database)' : 'Using built-in defaults'}
              </p>
            </div>
            <div className={`flex ${isMobile ? 'flex-col w-full' : 'flex-wrap'} gap-2`}>
              <button
                type="button"
                onClick={handleExport}
                className={`px-3 py-2 ${ADMIN_PRIMARY_BTN}`}
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || saving}
                className="px-3 py-2 text-sm font-medium bg-white/70 dark:bg-slate-900/40 border border-sky-200/60 dark:border-sky-700/40 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-slate-700 dark:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import JSON'}
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={saving || !effective.isCustom}
                className="px-3 py-2 text-sm font-medium bg-white/70 dark:bg-slate-900/40 border border-sky-200/60 dark:border-sky-700/40 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-slate-700 dark:text-slate-200 rounded-lg transition-colors disabled:opacity-50"
                title="Clear custom presets and restore built-ins"
              >
                Reset defaults
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

        <div className="p-6 space-y-6">
          <div className="rounded-xl border border-sky-100 dark:border-sky-900/40 bg-gradient-to-br from-sky-50/40 to-white dark:from-sky-950/20 dark:to-slate-800 p-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">Add device</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              Example: iPhone 17 / 18 — reuse variant <code className="font-mono text-[11px]">iphone-island</code> with the CSS
              viewport width × height.
            </p>
            <div className={`grid ${isMobile ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-3'} gap-3`}>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Id
                <input
                  className={`${ADMIN_FIELD} mt-1`}
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="iphone-17"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Label
                <input
                  className={`${ADMIN_FIELD} mt-1`}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="iPhone 17"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Group
                <select
                  className={`${ADMIN_FIELD} mt-1`}
                  value={newGroup}
                  onChange={(e) => {
                    const g = e.target.value as DevicePresetGroup;
                    setNewGroup(g);
                    setNewVariant(suggestVariantForGroup(g));
                  }}
                >
                  {PRESET_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Width
                <input
                  type="number"
                  min={120}
                  max={4096}
                  className={`${ADMIN_FIELD} mt-1`}
                  value={newWidth}
                  onChange={(e) => setNewWidth(Number(e.target.value))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Height
                <input
                  type="number"
                  min={120}
                  max={4096}
                  className={`${ADMIN_FIELD} mt-1`}
                  value={newHeight}
                  onChange={(e) => setNewHeight(Number(e.target.value))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Mockup variant
                <select
                  className={`${ADMIN_FIELD} mt-1`}
                  value={newVariant}
                  onChange={(e) => setNewVariant(e.target.value as DeviceMockupVariant)}
                >
                  {DEVICE_MOCKUP_VARIANTS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleAddDevice()}
                className={`px-4 py-2 ${ADMIN_PRIMARY_BTN}`}
              >
                {saving ? 'Saving…' : 'Add & save'}
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm font-medium border border-sky-200/70 dark:border-sky-700/40 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                onClick={() => {
                  setNewId('iphone-18');
                  setNewLabel('iPhone 18');
                  setNewWidth(420);
                  setNewHeight(912);
                  setNewGroup('iPhone');
                  setNewVariant('iphone-island');
                }}
              >
                Fill iPhone 18 example
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-sky-100 dark:border-sky-900/40">
            <table className="min-w-full text-sm">
              <thead className="bg-sky-50/80 dark:bg-sky-950/40 text-left text-xs uppercase tracking-wide text-sky-800/70 dark:text-sky-200/70">
                <tr>
                  <th className="px-3 py-2 font-semibold">Device</th>
                  <th className="px-3 py-2 font-semibold">Size</th>
                  <th className="px-3 py-2 font-semibold">Group</th>
                  <th className="px-3 py-2 font-semibold">Variant</th>
                  <th className="px-3 py-2 font-semibold">Quick</th>
                  <th className="px-3 py-2 font-semibold"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100 dark:divide-sky-900/40">
                {effective.presets.map((p) => (
                  <tr key={p.id} className="bg-white dark:bg-slate-800/60">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-white">{p.label}</div>
                      <div className="text-[11px] font-mono text-slate-500">{p.id}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-700 dark:text-slate-300">
                      {p.width}×{p.height}
                    </td>
                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{p.group}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {p.variant}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-sky-600"
                        checked={effective.quickPresets.includes(p.id)}
                        disabled={saving}
                        onChange={() => void handleToggleQuick(p.id)}
                        aria-label={`Quick bar: ${p.label}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleDelete(p.id)}
                        className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Built-in catalog has {DEFAULT_DEVICE_PRESETS.length} devices and {DEFAULT_QUICK_PRESETS.length} quick
            shortcuts. See <code className="font-mono">docs/device-presets.template.json</code> for a full template.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DevicePresetsAdmin;
