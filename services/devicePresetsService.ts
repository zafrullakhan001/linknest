import type { DeviceMockupVariant } from '../components/DeviceMockupFrame';

export type DevicePresetGroup = 'Responsive' | 'iPhone' | 'Android' | 'Tablet' | 'Watch' | 'Enterprise';

export interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  variant: DeviceMockupVariant;
  group: DevicePresetGroup;
}

export interface DevicePresetsExportFile {
  version: number;
  exportedAt: string;
  quickPresets: string[];
  presets: DevicePreset[];
}

export interface EffectiveDevicePresets {
  presets: DevicePreset[];
  quickPresets: string[];
  isCustom: boolean;
}

export const PRESET_GROUPS: readonly DevicePresetGroup[] = [
  'Responsive',
  'iPhone',
  'Android',
  'Tablet',
  'Enterprise',
  'Watch',
] as const;

export const DEVICE_MOCKUP_VARIANTS: readonly DeviceMockupVariant[] = [
  'iphone-island',
  'iphone-notch',
  'iphone-legacy',
  'android',
  'android-tablet',
  'ipad',
  'watch-square',
  'watch-round',
  'zebra-handheld',
  'zebra-tc73',
  'zebra-tc58',
  'zebra-tc52ax',
  'zebra-et60',
  'zebra-et51',
  'zebra-mc3300',
  'zebra-mc9300',
] as const;

export const MAX_DEVICE_PRESETS = 200;
export const MIN_DEVICE_DIM = 120;
export const MAX_DEVICE_DIM = 4096;

/** Built-in presets for In-app mockups + Device emulation windows. Keep in sync with api/device_presets_lib.php. */
export const DEFAULT_DEVICE_PRESETS: DevicePreset[] = [
  { id: 'responsive', label: 'Responsive', width: 543, height: 1006, variant: 'android', group: 'Responsive' },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, variant: 'iphone-legacy', group: 'iPhone' },
  { id: 'iphone-14', label: 'iPhone 14', width: 390, height: 844, variant: 'iphone-notch', group: 'iPhone' },
  { id: 'iphone-15-pro', label: 'iPhone 15 Pro', width: 393, height: 852, variant: 'iphone-island', group: 'iPhone' },
  { id: 'iphone-16-pro', label: 'iPhone 16 Pro', width: 402, height: 874, variant: 'iphone-island', group: 'iPhone' },
  { id: 'pixel-7', label: 'Pixel 7', width: 412, height: 915, variant: 'android', group: 'Android' },
  { id: 'pixel-8', label: 'Pixel 8', width: 412, height: 915, variant: 'android', group: 'Android' },
  { id: 'pixel-9', label: 'Pixel 9', width: 412, height: 924, variant: 'android', group: 'Android' },
  { id: 'galaxy-s24', label: 'Galaxy S24', width: 360, height: 780, variant: 'android', group: 'Android' },
  { id: 'ipad', label: 'iPad', width: 820, height: 1180, variant: 'ipad', group: 'Tablet' },
  { id: 'android-tablet', label: 'Android Tablet', width: 800, height: 1280, variant: 'android-tablet', group: 'Tablet' },
  { id: 'watch-square', label: 'Watch (Square)', width: 198, height: 242, variant: 'watch-square', group: 'Watch' },
  { id: 'watch-round', label: 'Watch (Round)', width: 360, height: 360, variant: 'watch-round', group: 'Watch' },
  { id: 'zebra-tc21', label: 'Zebra TC21 · HD (720×1280)', width: 720, height: 1280, variant: 'zebra-handheld', group: 'Enterprise' },
  { id: 'zebra-tc52', label: 'Zebra TC52 · HD (720×1280)', width: 720, height: 1280, variant: 'zebra-tc52ax', group: 'Enterprise' },
  { id: 'zebra-tc52ax', label: 'Zebra TC52ax · HD (720×1280)', width: 720, height: 1280, variant: 'zebra-tc52ax', group: 'Enterprise' },
  { id: 'zebra-tc57', label: 'Zebra TC57 · HD (720×1280)', width: 720, height: 1280, variant: 'zebra-tc52ax', group: 'Enterprise' },
  { id: 'zebra-tc58', label: 'Zebra TC58 · Full HD (1080×2160)', width: 1080, height: 2160, variant: 'zebra-tc58', group: 'Enterprise' },
  { id: 'zebra-tc73', label: 'Zebra TC73 · Full HD+ (1080×2160)', width: 1080, height: 2160, variant: 'zebra-tc73', group: 'Enterprise' },
  { id: 'zebra-mc3300', label: 'Zebra MC3300 (480×800)', width: 480, height: 800, variant: 'zebra-mc3300', group: 'Enterprise' },
  { id: 'zebra-mc3300-768', label: 'Zebra MC3300 (480×768)', width: 480, height: 768, variant: 'zebra-mc3300', group: 'Enterprise' },
  { id: 'zebra-mc9300', label: 'Zebra MC9300 (480×800)', width: 480, height: 800, variant: 'zebra-mc9300', group: 'Enterprise' },
  { id: 'zebra-et51', label: 'Zebra ET51 · WUXGA (1920×1200)', width: 1920, height: 1200, variant: 'zebra-et51', group: 'Enterprise' },
  { id: 'zebra-et60', label: 'Zebra ET60 · WUXGA (1920×1200)', width: 1920, height: 1200, variant: 'zebra-et60', group: 'Enterprise' },
];

export const DEFAULT_QUICK_PRESETS: string[] = [
  'iphone-14',
  'iphone-15-pro',
  'pixel-7',
  'pixel-8',
  'galaxy-s24',
  'ipad',
  'zebra-tc73',
  'zebra-et60',
  'watch-square',
  'watch-round',
];

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 375;
  return Math.min(MAX_DEVICE_DIM, Math.max(MIN_DEVICE_DIM, Math.round(n)));
}

function isPresetGroup(value: unknown): value is DevicePresetGroup {
  return typeof value === 'string' && (PRESET_GROUPS as readonly string[]).includes(value);
}

function isMockupVariant(value: unknown): value is DeviceMockupVariant {
  return typeof value === 'string' && (DEVICE_MOCKUP_VARIANTS as readonly string[]).includes(value);
}

function slugifyId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Normalize a single preset; returns null if invalid. */
export function normalizePreset(raw: unknown, usedIds?: Set<string>): DevicePreset | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = slugifyId(String(obj.id ?? ''));
  const label = String(obj.label ?? '').trim().slice(0, 120);
  if (!id || !label) return null;
  if (usedIds?.has(id)) return null;
  if (!isPresetGroup(obj.group) || !isMockupVariant(obj.variant)) return null;
  const width = clampDim(Number(obj.width));
  const height = clampDim(Number(obj.height));
  usedIds?.add(id);
  return { id, label, width, height, variant: obj.variant, group: obj.group };
}

export function normalizePresets(raw: unknown): DevicePreset[] {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const out: DevicePreset[] = [];
  for (const item of raw) {
    if (out.length >= MAX_DEVICE_PRESETS) break;
    const preset = normalizePreset(item, used);
    if (preset) out.push(preset);
  }
  return out;
}

export function normalizeQuickPresets(raw: unknown, presets: DevicePreset[]): string[] {
  const ids = new Set(presets.map((p) => p.id));
  if (!Array.isArray(raw)) {
    return DEFAULT_QUICK_PRESETS.filter((id) => ids.has(id));
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = slugifyId(String(item ?? ''));
    if (!id || !ids.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= 40) break;
  }
  return out;
}

export function parsePresetsJson(raw: string | undefined | null): DevicePreset[] | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    const presets = normalizePresets(parsed);
    return presets.length > 0 ? presets : null;
  } catch {
    return null;
  }
}

export function parseQuickPresetsJson(
  raw: string | undefined | null,
  presets: DevicePreset[]
): string[] {
  if (raw == null || !String(raw).trim()) {
    return normalizeQuickPresets(DEFAULT_QUICK_PRESETS, presets);
  }
  try {
    const parsed = JSON.parse(String(raw));
    const quick = normalizeQuickPresets(parsed, presets);
    return quick.length > 0 ? quick : normalizeQuickPresets(DEFAULT_QUICK_PRESETS, presets);
  } catch {
    return normalizeQuickPresets(DEFAULT_QUICK_PRESETS, presets);
  }
}

export function getEffectivePresets(settings?: {
  device_presets?: string;
  device_quick_presets?: string;
}): EffectiveDevicePresets {
  const custom = parsePresetsJson(settings?.device_presets);
  if (!custom) {
    return {
      presets: DEFAULT_DEVICE_PRESETS,
      quickPresets: DEFAULT_QUICK_PRESETS,
      isCustom: false,
    };
  }
  return {
    presets: custom,
    quickPresets: parseQuickPresetsJson(settings?.device_quick_presets, custom),
    isCustom: true,
  };
}

export function findPreset(presets: DevicePreset[], id: string): DevicePreset {
  return (
    presets.find((p) => p.id === id) ||
    presets.find((p) => p.id === 'iphone-14') ||
    presets.find((p) => p.id === 'responsive') ||
    presets[0]
  );
}

export function buildExportFile(
  presets: DevicePreset[],
  quickPresets: string[]
): DevicePresetsExportFile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    quickPresets: normalizeQuickPresets(quickPresets, presets),
    presets: normalizePresets(presets),
  };
}

export function parseImportFile(raw: unknown): {
  presets: DevicePreset[];
  quickPresets: string[];
} {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid JSON: expected an object');
  }
  const obj = raw as Record<string, unknown>;

  // Allow either full export shape or a bare presets array
  const presetsRaw = Array.isArray(obj.presets) ? obj.presets : Array.isArray(raw) ? raw : null;
  if (!presetsRaw) {
    throw new Error('Invalid file: missing "presets" array');
  }

  const presets = normalizePresets(presetsRaw);
  if (presets.length === 0) {
    throw new Error('No valid device presets found in file');
  }
  if (presets.length > MAX_DEVICE_PRESETS) {
    throw new Error(`Too many presets (max ${MAX_DEVICE_PRESETS})`);
  }

  const quickPresets = normalizeQuickPresets(obj.quickPresets, presets);
  return { presets, quickPresets };
}

export function downloadDevicePresetsJson(
  presets: DevicePreset[],
  quickPresets: string[],
  filename?: string
): void {
  const payload = buildExportFile(presets, quickPresets);
  const jsonData = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonData], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `device-presets-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function suggestVariantForGroup(group: DevicePresetGroup): DeviceMockupVariant {
  switch (group) {
    case 'iPhone':
      return 'iphone-island';
    case 'Android':
      return 'android';
    case 'Tablet':
      return 'ipad';
    case 'Watch':
      return 'watch-square';
    case 'Enterprise':
      return 'zebra-handheld';
    case 'Responsive':
    default:
      return 'android';
  }
}
