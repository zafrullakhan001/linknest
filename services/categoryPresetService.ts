import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();
const PRESET_BASE = `${API_BASE}/category-presets`;

export interface DbCategoryPreset {
  id: string;
  tab_key: string;
  name: string;
  visible: string[];
  is_active: boolean;
  created_at?: number;
  updated_at?: number;
}

export interface CategoryPresetList {
  presets: DbCategoryPreset[];
  activeByTab: Record<string, string>;
}

async function parseJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export const categoryPresetService = {
  async list(): Promise<CategoryPresetList> {
    const res = await fetch(PRESET_BASE, { method: 'GET', credentials: 'include' });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to load category presets');
    return {
      presets: Array.isArray(data.presets) ? data.presets : [],
      activeByTab: data.activeByTab && typeof data.activeByTab === 'object' ? data.activeByTab : {},
    };
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
    return data.preset as DbCategoryPreset;
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`${PRESET_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to delete category preset');
  },

  async apply(id: string): Promise<DbCategoryPreset> {
    const res = await fetch(`${PRESET_BASE}/${encodeURIComponent(id)}/apply`, {
      method: 'POST',
      credentials: 'include',
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to apply category preset');
    return data.preset as DbCategoryPreset;
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
      presets: Array.isArray(data.presets) ? data.presets : [],
      activeByTab: data.activeByTab && typeof data.activeByTab === 'object' ? data.activeByTab : {},
    };
  },

  async sync(presets: Array<{ id?: string; tab_key: string; name: string; visible: string[]; is_active?: boolean }>): Promise<CategoryPresetList> {
    const res = await fetch(`${PRESET_BASE}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ presets }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to sync category presets');
    return {
      presets: Array.isArray(data.presets) ? data.presets : [],
      activeByTab: data.activeByTab && typeof data.activeByTab === 'object' ? data.activeByTab : {},
    };
  },
};

export function groupDbCategoryPresets(presets: DbCategoryPreset[]): Record<string, Array<{ id: string; name: string; visible: string[] }>> {
  const out: Record<string, Array<{ id: string; name: string; visible: string[] }>> = {};
  for (const preset of presets) {
    if (!out[preset.tab_key]) out[preset.tab_key] = [];
    out[preset.tab_key].push({
      id: String(preset.id),
      name: preset.name,
      visible: Array.isArray(preset.visible) ? preset.visible : [],
    });
  }
  return out;
}

export function flattenCategoryPresetsForSync(
  byTab: Record<string, Array<{ id: string; name: string; visible: string[] }>>,
  activeByTab: Record<string, string>
): Array<{ id?: string; tab_key: string; name: string; visible: string[]; is_active?: boolean }> {
  const out: Array<{ id?: string; tab_key: string; name: string; visible: string[]; is_active?: boolean }> = [];
  for (const [tabKey, list] of Object.entries(byTab)) {
    for (const preset of list) {
      out.push({
        id: /^\d+$/.test(preset.id) ? preset.id : undefined,
        tab_key: tabKey,
        name: preset.name,
        visible: preset.visible,
        is_active: activeByTab[tabKey] === preset.id,
      });
    }
  }
  return out;
}
