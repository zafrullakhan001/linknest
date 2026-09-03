import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();
const PRESET_BASE = `${API_BASE}/category-presets`;

export type CategoryPresetSource = 'user' | 'builtin';

export interface DbCategoryPreset {
  id: string;
  db_id?: string;
  tab_key: string;
  name: string;
  visible: string[];
  is_active: boolean;
  is_default?: boolean;
  scope?: CategoryPresetSource;
  source?: CategoryPresetSource;
  created_at?: number;
  updated_at?: number;
}

export interface CategoryPresetList {
  presets: DbCategoryPreset[];
  activeByTab: Record<string, string>;
}

export interface BuiltinCategoryPresetList {
  presets: DbCategoryPreset[];
}

export interface CategoryVisibilityPresetItem {
  id: string;
  name: string;
  visible: string[];
  source?: CategoryPresetSource;
  is_default?: boolean;
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function normalizePreset(raw: any): DbCategoryPreset {
  const scope: CategoryPresetSource = raw?.scope === 'builtin' || raw?.source === 'builtin' ? 'builtin' : 'user';
  const dbId = raw?.db_id != null ? String(raw.db_id) : (/^\d+$/.test(String(raw?.id ?? '')) ? String(raw.id) : '');
  const id =
    scope === 'builtin'
      ? String(raw?.id ?? '').startsWith('builtin-')
        ? String(raw.id)
        : `builtin-${dbId || raw?.id || ''}`
      : String(raw?.id ?? '');
  return {
    id,
    db_id: dbId || undefined,
    tab_key: String(raw?.tab_key ?? ''),
    name: String(raw?.name ?? ''),
    visible: Array.isArray(raw?.visible) ? raw.visible.filter((n: unknown): n is string => typeof n === 'string') : [],
    is_active: !!raw?.is_active,
    is_default: scope === 'builtin' && (!!raw?.is_default || !!raw?.is_active),
    scope,
    source: scope,
    created_at: typeof raw?.created_at === 'number' ? raw.created_at : undefined,
    updated_at: typeof raw?.updated_at === 'number' ? raw.updated_at : undefined,
  };
}

export function isBuiltinPresetId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('builtin-');
}

export function builtinDbIdFromPresetId(id: string): string | null {
  if (!isBuiltinPresetId(id)) return null;
  const raw = id.slice('builtin-'.length);
  return /^\d+$/.test(raw) ? raw : null;
}

export const categoryPresetService = {
  async list(): Promise<CategoryPresetList> {
    const res = await fetch(PRESET_BASE, { method: 'GET', credentials: 'include' });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load category presets');
    const presets = Array.isArray(data.presets) ? data.presets.map(normalizePreset) : [];
    return {
      presets,
      activeByTab: data.activeByTab && typeof data.activeByTab === 'object' ? data.activeByTab : {},
    };
  },

  async listBuiltin(tabKey?: string): Promise<BuiltinCategoryPresetList> {
    const qs = tabKey ? `?tab_key=${encodeURIComponent(tabKey)}` : '';
    const res = await fetch(`${PRESET_BASE}/builtin${qs}`, { method: 'GET', credentials: 'include' });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load built-in category presets');
    return {
      presets: Array.isArray(data.presets) ? data.presets.map(normalizePreset) : [],
    };
  },

  async saveBuiltin(tabKey: string, name: string, visible: string[]): Promise<DbCategoryPreset> {
    const res = await fetch(`${PRESET_BASE}/builtin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tab_key: tabKey, name, visible }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to save built-in category preset');
    return normalizePreset(data.preset);
  },

  async updateBuiltin(id: string, payload: { tab_key?: string; name?: string; visible?: string[] }): Promise<DbCategoryPreset> {
    const dbId = builtinDbIdFromPresetId(id) || (/^\d+$/.test(id) ? id : '');
    if (!dbId) throw new Error('Invalid built-in preset id');
    const res = await fetch(`${PRESET_BASE}/builtin/${encodeURIComponent(dbId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to update built-in category preset');
    return normalizePreset(data.preset);
  },

  async removeBuiltin(id: string): Promise<void> {
    const dbId = builtinDbIdFromPresetId(id) || (/^\d+$/.test(id) ? id : '');
    if (!dbId) throw new Error('Invalid built-in preset id');
    const res = await fetch(`${PRESET_BASE}/builtin/${encodeURIComponent(dbId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to delete built-in category preset');
  },

  async setBuiltinDefault(id: string): Promise<DbCategoryPreset> {
    const dbId = builtinDbIdFromPresetId(id) || (/^\d+$/.test(id) ? id : '');
    if (!dbId) throw new Error('Invalid built-in preset id');
    const res = await fetch(`${PRESET_BASE}/builtin/${encodeURIComponent(dbId)}/default`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to set default built-in preset');
    return normalizePreset(data.preset);
  },

  async save(tabKey: string, name: string, visible: string[]): Promise<DbCategoryPreset> {
    const res = await fetch(PRESET_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tab_key: tabKey, name, visible }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to save category preset');
    return normalizePreset(data.preset);
  },

  async remove(id: string): Promise<void> {
    if (isBuiltinPresetId(id)) {
      throw new Error('Built-in presets cannot be deleted');
    }
    const res = await fetch(`${PRESET_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to delete category preset');
  },

  async apply(id: string): Promise<DbCategoryPreset> {
    if (isBuiltinPresetId(id)) {
      throw new Error('Built-in presets are applied locally only');
    }
    const res = await fetch(`${PRESET_BASE}/${encodeURIComponent(id)}/apply`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to apply category preset');
    return normalizePreset(data.preset);
  },

  async setActive(tabKey: string, id: string | null): Promise<void> {
    const res = await fetch(`${PRESET_BASE}/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ tab_key: tabKey, id }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to update active category preset');
  },

  async importLocal(presets: Array<{ tab_key: string; name: string; visible: string[]; is_active?: boolean }>): Promise<CategoryPresetList> {
    const res = await fetch(`${PRESET_BASE}/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ presets }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to import category presets');
    return {
      presets: Array.isArray(data.presets) ? data.presets.map(normalizePreset) : [],
      activeByTab: data.activeByTab && typeof data.activeByTab === 'object' ? data.activeByTab : {},
    };
  },

  async sync(presets: Array<{ id?: string; tab_key: string; name: string; visible: string[]; is_active?: boolean; source?: CategoryPresetSource }>): Promise<CategoryPresetList> {
    const personal = presets.filter((p) => p.source !== 'builtin' && !isBuiltinPresetId(p.id));
    const res = await fetch(`${PRESET_BASE}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ presets: personal }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to sync category presets');
    return {
      presets: Array.isArray(data.presets) ? data.presets.map(normalizePreset) : [],
      activeByTab: data.activeByTab && typeof data.activeByTab === 'object' ? data.activeByTab : {},
    };
  },
};

export function groupDbCategoryPresets(
  presets: DbCategoryPreset[]
): Record<string, CategoryVisibilityPresetItem[]> {
  const out: Record<string, CategoryVisibilityPresetItem[]> = {};
  for (const preset of presets) {
    if (preset.source === 'builtin' || preset.scope === 'builtin') continue;
    if (!out[preset.tab_key]) out[preset.tab_key] = [];
    out[preset.tab_key].push({
      id: String(preset.id),
      name: preset.name,
      visible: Array.isArray(preset.visible) ? preset.visible : [],
      source: 'user',
    });
  }
  return out;
}

export function groupBuiltinCategoryPresets(
  presets: DbCategoryPreset[]
): Record<string, CategoryVisibilityPresetItem[]> {
  const out: Record<string, CategoryVisibilityPresetItem[]> = {};
  for (const preset of presets) {
    if (!out[preset.tab_key]) out[preset.tab_key] = [];
    out[preset.tab_key].push({
      id: String(preset.id).startsWith('builtin-') ? String(preset.id) : `builtin-${preset.id}`,
      name: preset.name,
      visible: Array.isArray(preset.visible) ? preset.visible : [],
      source: 'builtin',
      is_default: !!(preset.is_default || (preset.scope === 'builtin' && preset.is_active)),
    });
  }
  // Defaults first so callers can use [0] as a fallback
  for (const tab of Object.keys(out)) {
    out[tab].sort((a, b) => {
      if (!!a.is_default !== !!b.is_default) return a.is_default ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }
  return out;
}

/** Pick the admin-marked default built-in for a tab, or the first built-in. */
export function pickDefaultBuiltinPreset(
  builtins: CategoryVisibilityPresetItem[] | undefined
): CategoryVisibilityPresetItem | null {
  const list = builtins || [];
  if (list.length === 0) return null;
  return list.find((p) => p.is_default) || list[0] || null;
}

export function mergeCategoryPresetsForTab(
  builtins: CategoryVisibilityPresetItem[] | undefined,
  userPresets: CategoryVisibilityPresetItem[] | undefined
): CategoryVisibilityPresetItem[] {
  const built = (builtins || []).map((p) => ({ ...p, source: 'builtin' as const }));
  const users = (userPresets || []).map((p) => ({
    ...p,
    source: (p.source === 'builtin' ? 'builtin' : 'user') as CategoryPresetSource,
  }));
  return [...built, ...users.filter((p) => p.source !== 'builtin')];
}

export function flattenCategoryPresetsForSync(
  byTab: Record<string, CategoryVisibilityPresetItem[]>,
  activeByTab: Record<string, string>
): Array<{ id?: string; tab_key: string; name: string; visible: string[]; is_active?: boolean; source?: CategoryPresetSource }> {
  const out: Array<{ id?: string; tab_key: string; name: string; visible: string[]; is_active?: boolean; source?: CategoryPresetSource }> = [];
  for (const [tabKey, list] of Object.entries(byTab)) {
    for (const preset of list) {
      if (preset.source === 'builtin' || isBuiltinPresetId(preset.id)) continue;
      out.push({
        id: /^\d+$/.test(preset.id) ? preset.id : undefined,
        tab_key: tabKey,
        name: preset.name,
        visible: preset.visible,
        is_active: activeByTab[tabKey] === preset.id,
        source: 'user',
      });
    }
  }
  return out;
}

export interface CategoryPresetsExportFile {
  version: 1;
  kind: 'linknest-category-presets';
  scope: 'builtin' | 'user';
  exportedAt: string;
  presets: Array<{ tab_key: string; name: string; visible: string[] }>;
  activeByTab?: Record<string, string>;
}

const ALLOWED_EXPORT_TABS = new Set([
  'favorites', 'public', 'public-favorites', 'your-apps', 'staging', 'private',
  'scheduled', 'expired', 'archive', 'recycle-bin', 'monitoring', 'monitorv2',
]);

function normalizeExportPresetItem(raw: unknown): { tab_key: string; name: string; visible: string[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const tabKey = typeof item.tab_key === 'string' ? item.tab_key.trim() : '';
  const name = typeof item.name === 'string' ? item.name.trim().slice(0, 60) : '';
  if (!tabKey || !ALLOWED_EXPORT_TABS.has(tabKey) || !name) return null;
  const visible = Array.isArray(item.visible)
    ? item.visible
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
        .map((n) => n.trim())
        .slice(0, 200)
    : [];
  return { tab_key: tabKey, name, visible };
}

export function buildCategoryPresetsExportFile(
  presets: Array<{ tab_key: string; name: string; visible: string[] }>,
  scope: 'builtin' | 'user',
  activeByTab?: Record<string, string>
): CategoryPresetsExportFile {
  const normalized = presets
    .map((p) => normalizeExportPresetItem(p))
    .filter((p): p is { tab_key: string; name: string; visible: string[] } => !!p);
  const file: CategoryPresetsExportFile = {
    version: 1,
    kind: 'linknest-category-presets',
    scope,
    exportedAt: new Date().toISOString(),
    presets: normalized,
  };
  if (scope === 'user' && activeByTab && Object.keys(activeByTab).length > 0) {
    file.activeByTab = { ...activeByTab };
  }
  return file;
}

export function parseCategoryPresetsImportFile(raw: unknown): {
  scope: 'builtin' | 'user' | 'unknown';
  presets: Array<{ tab_key: string; name: string; visible: string[] }>;
  activeByTab: Record<string, string>;
} {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid JSON: expected an object');
  }
  const obj = raw as Record<string, unknown>;
  const presetsRaw = Array.isArray(obj.presets) ? obj.presets : Array.isArray(raw) ? raw : null;
  if (!presetsRaw) {
    throw new Error('Invalid file: missing "presets" array');
  }
  const presets = presetsRaw
    .map((item) => normalizeExportPresetItem(item))
    .filter((p): p is { tab_key: string; name: string; visible: string[] } => !!p);
  if (presets.length === 0) {
    throw new Error('No valid category presets found in file');
  }
  if (presets.length > 100) {
    throw new Error('Too many presets in file (max 100)');
  }
  const scopeRaw = obj.scope === 'builtin' || obj.scope === 'user' ? obj.scope : 'unknown';
  const activeByTab: Record<string, string> = {};
  if (obj.activeByTab && typeof obj.activeByTab === 'object' && !Array.isArray(obj.activeByTab)) {
    for (const [tab, id] of Object.entries(obj.activeByTab as Record<string, unknown>)) {
      if (typeof id === 'string' && id.trim() && ALLOWED_EXPORT_TABS.has(tab)) {
        activeByTab[tab] = id.trim();
      }
    }
  }
  return { scope: scopeRaw, presets, activeByTab };
}

export function downloadCategoryPresetsJson(
  presets: Array<{ tab_key: string; name: string; visible: string[] }>,
  scope: 'builtin' | 'user',
  activeByTab?: Record<string, string>,
  filename?: string
): void {
  const payload = buildCategoryPresetsExportFile(presets, scope, activeByTab);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `linknest-category-presets-${scope}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Merge imported personal presets into an existing by-tab map (upsert by name, case-insensitive). */
export function mergeImportedUserPresets(
  existing: Record<string, CategoryVisibilityPresetItem[]>,
  imported: Array<{ tab_key: string; name: string; visible: string[] }>,
  makeIds: () => string
): Record<string, CategoryVisibilityPresetItem[]> {
  const next: Record<string, CategoryVisibilityPresetItem[]> = {};
  for (const [tab, list] of Object.entries(existing)) {
    next[tab] = list
      .filter((p) => p.source !== 'builtin' && !isBuiltinPresetId(p.id))
      .map((p) => ({ ...p, source: 'user' as const }));
  }
  for (const item of imported) {
    const list = [...(next[item.tab_key] || [])];
    const idx = list.findIndex((p) => p.name.toLowerCase() === item.name.toLowerCase());
    const row: CategoryVisibilityPresetItem = {
      id: idx >= 0 ? list[idx].id : makeIds(),
      name: item.name,
      visible: [...item.visible],
      source: 'user',
    };
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    next[item.tab_key] = list;
  }
  return next;
}

/** Browser localStorage keys for personal (non-built-in) category presets. */
export const CATEGORY_PRESETS_STORAGE_KEY = 'linknest_category_presets';
export const CATEGORY_PRESET_ACTIVE_STORAGE_KEY = 'linknest_category_preset_active';

function isPersonalPreset(preset: CategoryVisibilityPresetItem): boolean {
  return preset.source !== 'builtin' && !isBuiltinPresetId(preset.id);
}

/** Parse personal presets from a localStorage JSON string (built-ins stripped). */
export function parsePersonalCategoryPresetsByTab(
  raw: string | null | undefined
): Record<string, CategoryVisibilityPresetItem[]> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, CategoryVisibilityPresetItem[]> = {};
    for (const [tab, list] of Object.entries(parsed)) {
      if (!Array.isArray(list)) continue;
      const presets: CategoryVisibilityPresetItem[] = [];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const name = typeof (item as CategoryVisibilityPresetItem).name === 'string'
          ? (item as CategoryVisibilityPresetItem).name.trim()
          : '';
        if (!name) continue;
        const rawId = typeof (item as CategoryVisibilityPresetItem).id === 'string'
          ? (item as CategoryVisibilityPresetItem).id.trim()
          : '';
        const visible = Array.isArray((item as CategoryVisibilityPresetItem).visible)
          ? (item as CategoryVisibilityPresetItem).visible
            .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
            .map((n) => n.trim())
          : [];
        const source: CategoryPresetSource =
          rawId.startsWith('builtin-') || (item as CategoryVisibilityPresetItem).source === 'builtin'
            ? 'builtin'
            : 'user';
        if (source === 'builtin') continue;
        presets.push({
          id: rawId || `preset-${tab}-${presets.length}-${name.toLowerCase()}`,
          name,
          visible,
          source: 'user',
        });
      }
      if (presets.length > 0) out[tab] = presets;
    }
    return out;
  } catch {
    return {};
  }
}

export function parseActiveCategoryPresetIds(
  raw: string | null | undefined
): Record<string, string> {
  if (!raw || typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [tab, id] of Object.entries(parsed)) {
      // Never treat built-in ids as browser persistence — built-ins are the default until user saves a My preset
      if (typeof id === 'string' && id.trim() && !isBuiltinPresetId(id.trim())) {
        out[tab] = id.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Keep only personal presets (never built-ins) for browser storage. */
export function filterPersonalCategoryPresetsByTab(
  byTab: Record<string, CategoryVisibilityPresetItem[]>
): Record<string, CategoryVisibilityPresetItem[]> {
  const personalOnly: Record<string, CategoryVisibilityPresetItem[]> = {};
  for (const [tab, list] of Object.entries(byTab)) {
    const filtered = (list || [])
      .filter(isPersonalPreset)
      .map(({ id, name, visible }) => ({ id, name, visible, source: 'user' as const }));
    if (filtered.length > 0) personalOnly[tab] = filtered;
  }
  return personalOnly;
}

/** Read personal category presets from this browser's localStorage. */
export function readPersonalCategoryPresets(): Record<string, CategoryVisibilityPresetItem[]> {
  if (typeof window === 'undefined') return {};
  try {
    return parsePersonalCategoryPresetsByTab(localStorage.getItem(CATEGORY_PRESETS_STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Write personal category presets to localStorage immediately (built-ins never stored). */
export function writePersonalCategoryPresets(
  byTab: Record<string, CategoryVisibilityPresetItem[]>
): void {
  if (typeof window === 'undefined') return;
  try {
    const personalOnly = filterPersonalCategoryPresetsByTab(byTab);
    if (Object.keys(personalOnly).length > 0) {
      localStorage.setItem(CATEGORY_PRESETS_STORAGE_KEY, JSON.stringify(personalOnly));
    } else {
      localStorage.removeItem(CATEGORY_PRESETS_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Failed to save category presets', e);
  }
}

/** Read active preset id per tab from localStorage. */
export function readActiveCategoryPresetIds(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return parseActiveCategoryPresetIds(localStorage.getItem(CATEGORY_PRESET_ACTIVE_STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Write active preset ids to localStorage — personal My presets only (never built-in defaults). */
export function writeActiveCategoryPresetIds(activeByTab: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    const personalOnly: Record<string, string> = {};
    for (const [tab, id] of Object.entries(activeByTab)) {
      if (typeof id === 'string' && id.trim() && !isBuiltinPresetId(id)) {
        personalOnly[tab] = id.trim();
      }
    }
    if (Object.keys(personalOnly).length > 0) {
      localStorage.setItem(CATEGORY_PRESET_ACTIVE_STORAGE_KEY, JSON.stringify(personalOnly));
    } else {
      localStorage.removeItem(CATEGORY_PRESET_ACTIVE_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Failed to save active category preset', e);
  }
}

/**
 * Remove a personal preset from a by-tab map (and clear active if it pointed at it).
 * Does not touch built-in presets.
 */
export function removePersonalPresetFromByTab(
  byTab: Record<string, CategoryVisibilityPresetItem[]>,
  tabKey: string,
  presetId: string
): Record<string, CategoryVisibilityPresetItem[]> {
  if (isBuiltinPresetId(presetId)) return byTab;
  const list = (byTab[tabKey] || []).filter((item) => item.id !== presetId && isPersonalPreset(item));
  const next = { ...byTab };
  if (list.length === 0) delete next[tabKey];
  else next[tabKey] = list;
  return next;
}

/**
 * Merge DB user presets with leftover browser-only (UUID) rows for admin display.
 * Prefers DB rows when name collides on the same tab.
 */
export function mergeBrowserPersonalPresetsForAdmin(
  dbPresets: DbCategoryPreset[],
  localByTab: Record<string, CategoryVisibilityPresetItem[]>
): Array<{ id: string; tab_key: string; name: string; visible: string[]; storage: 'db' | 'browser' }> {
  const rows: Array<{ id: string; tab_key: string; name: string; visible: string[]; storage: 'db' | 'browser' }> = [];
  const seen = new Set<string>();

  for (const preset of dbPresets) {
    if (preset.source === 'builtin' || preset.scope === 'builtin') continue;
    const key = `${preset.tab_key}::${preset.name.toLowerCase()}`;
    seen.add(key);
    rows.push({
      id: String(preset.id),
      tab_key: preset.tab_key,
      name: preset.name,
      visible: Array.isArray(preset.visible) ? preset.visible : [],
      storage: 'db',
    });
  }

  for (const [tabKey, list] of Object.entries(localByTab)) {
    for (const preset of list || []) {
      if (!isPersonalPreset(preset)) continue;
      const key = `${tabKey}::${preset.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: preset.id,
        tab_key: tabKey,
        name: preset.name,
        visible: [...preset.visible],
        storage: 'browser',
      });
    }
  }

  rows.sort((a, b) => {
    const tabCmp = a.tab_key.localeCompare(b.tab_key);
    if (tabCmp !== 0) return tabCmp;
    return a.name.localeCompare(b.name);
  });
  return rows;
}
