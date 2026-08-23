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
    });
  }
  return out;
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
