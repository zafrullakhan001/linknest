// User SSH gateway connections stored in the backend DB (authenticated users).
// Uses cookie-based auth (credentials: 'include') like the rest of the app.

function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) return envBase;

  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path !== '/' && path.length > 1) {
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') {
        return `${cleanPath}/api`;
      }
    }
  }
  return '/api';
}

const API_BASE = resolveApiBase();
const SSH_BASE = `${API_BASE}/ssh-connections`;

export const SSH_CONNECTION_COLORS = [
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f97316', // orange
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#64748b', // slate
] as const;

export type SshConnectionColor = (typeof SSH_CONNECTION_COLORS)[number] | string;

export type RemoteConnectionProtocol = 'ssh' | 'rdp';

/** Per-connection terminal look (theme / font). Shared command-bar settings stay global. */
/** Modern TERM values for Easy-mode ttyd/ssh (not vt100-era legacy types). */
export const SSH_TERM_TYPES = [
  'xterm-256color',
  'xterm-direct',
  'tmux-256color',
  'screen-256color',
  'rxvt-unicode-256color',
  'xterm',
  'linux',
] as const;

export type SshTermType = (typeof SSH_TERM_TYPES)[number];

export const DEFAULT_SSH_TERM_TYPE: SshTermType = 'xterm-256color';

export function normalizeSshTermType(raw: unknown): SshTermType {
  const t = String(raw || '').trim();
  return (SSH_TERM_TYPES as readonly string[]).includes(t) ? (t as SshTermType) : DEFAULT_SSH_TERM_TYPE;
}

export interface SshConnectionAppearance {
  themePresetId?: string;
  fontSize?: number;
  fontFamily?: string;
  bgColor?: string;
  fgColor?: string;
  cursorColor?: string;
  selectionBg?: string;
  ansi?: Record<string, string>;
  /** TERM string for Easy-mode ttyd (-T); applied on next Connect */
  termType?: SshTermType;
}

export interface SavedSshConnection {
  id: string;
  name: string;
  wsUrl: string;
  /** ssh = ttyd/auto; rdp = Guacamole / web RDP page URL */
  protocol?: RemoteConnectionProtocol;
  tags: string[];
  notes?: string;
  color?: string;
  appearance?: SshConnectionAppearance;
  /** Folder/group label; empty = Uncategorized */
  category?: string;
  /** Manual order within a category (lower = higher in list) */
  sortOrder?: number;
  createdAt: number;
  lastUsedAt?: number;
  /** When set, connection is archived (hidden from active list) */
  archivedAt?: number | null;
  /** When set, connection is in recycle bin (soft-deleted) */
  deletedAt?: number | null;
}

export function normalizeSshColor(raw: unknown): string {
  const c = String(raw || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  return '#0ea5e9';
}

export function normalizeConnectionProtocol(raw: unknown): RemoteConnectionProtocol {
  return String(raw || '').trim().toLowerCase() === 'rdp' ? 'rdp' : 'ssh';
}

export function normalizeSshCategory(raw: unknown): string {
  const cat = String(raw ?? '').trim();
  if (!cat) return '';
  return cat.length > 64 ? cat.slice(0, 64) : cat;
}

export function normalizeSshSortOrder(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1_000_000, Math.max(0, Math.round(n)));
}

export function normalizeSshAppearance(raw: unknown): SshConnectionAppearance | undefined {
  if (raw == null || raw === '') return undefined;
  let obj: any = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;

  const out: SshConnectionAppearance = {};
  if (typeof obj.themePresetId === 'string' && obj.themePresetId.trim()) {
    out.themePresetId = obj.themePresetId.trim();
  }
  if (Number.isFinite(Number(obj.fontSize))) {
    out.fontSize = Math.min(24, Math.max(11, Math.round(Number(obj.fontSize))));
  }
  if (typeof obj.fontFamily === 'string' && obj.fontFamily.trim()) {
    out.fontFamily = obj.fontFamily.trim();
  }
  for (const key of ['bgColor', 'fgColor', 'cursorColor', 'selectionBg'] as const) {
    const v = String(obj[key] || '').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) out[key] = v;
  }
  if (obj.ansi && typeof obj.ansi === 'object' && !Array.isArray(obj.ansi)) {
    const ansi: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj.ansi)) {
      const hex = String(v || '').trim().toLowerCase();
      if (/^#[0-9a-f]{6}$/.test(hex)) ansi[k] = hex;
    }
    if (Object.keys(ansi).length) out.ansi = ansi;
  }
  if (typeof obj.termType === 'string' && obj.termType.trim()) {
    const term = obj.termType.trim();
    if ((SSH_TERM_TYPES as readonly string[]).includes(term)) {
      out.termType = term as SshTermType;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function mapRow(row: any): SavedSshConnection {
  let tags: string[] = [];
  if (Array.isArray(row.tags)) {
    tags = row.tags.map(String);
  } else if (typeof row.tags === 'string') {
    try {
      const parsed = JSON.parse(row.tags);
      tags = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      tags = [];
    }
  }

  return {
    id: String(row.id),
    name: String(row.name || ''),
    wsUrl: String(row.wsUrl ?? row.ws_url ?? ''),
    protocol: normalizeConnectionProtocol(row.protocol),
    tags,
    notes: row.notes != null && String(row.notes) ? String(row.notes) : undefined,
    color: normalizeSshColor(row.color),
    appearance: normalizeSshAppearance(row.appearance),
    category: normalizeSshCategory(row.category),
    sortOrder: normalizeSshSortOrder(row.sortOrder ?? row.sort_order ?? 0),
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : Number(row.created_at) || Date.now(),
    lastUsedAt:
      typeof row.lastUsedAt === 'number'
        ? row.lastUsedAt
        : row.last_used_at != null
          ? Number(row.last_used_at) || undefined
          : undefined,
    archivedAt:
      row.archivedAt == null && row.archived_at == null
        ? null
        : Number(row.archivedAt ?? row.archived_at) || null,
    deletedAt:
      row.deletedAt == null && row.deleted_at == null
        ? null
        : Number(row.deletedAt ?? row.deleted_at) || null,
  };
}

export const sshConnectionService = {
  async list(): Promise<SavedSshConnection[]> {
    const res = await fetch(SSH_BASE, { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load SSH connections');
    const list = Array.isArray(data.connections) ? data.connections : [];
    return list.map(mapRow);
  },

  async create(input: {
    id?: string;
    name: string;
    wsUrl: string;
    protocol?: RemoteConnectionProtocol;
    tags?: string[];
    notes?: string;
    color?: string;
    appearance?: SshConnectionAppearance;
    category?: string;
    sortOrder?: number;
  }): Promise<SavedSshConnection> {
    const appearance = normalizeSshAppearance(input.appearance);
    const res = await fetch(SSH_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id: input.id,
        name: input.name,
        wsUrl: input.wsUrl,
        protocol: normalizeConnectionProtocol(input.protocol),
        tags: input.tags || [],
        notes: input.notes || '',
        color: normalizeSshColor(input.color),
        appearance: appearance || null,
        category: normalizeSshCategory(input.category),
        sortOrder: input.sortOrder !== undefined ? normalizeSshSortOrder(input.sortOrder) : undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create SSH connection');
    return mapRow(data.connection);
  },

  async update(
    id: string,
    patch: {
      name?: string;
      wsUrl?: string;
      protocol?: RemoteConnectionProtocol;
      tags?: string[];
      notes?: string;
      color?: string;
      appearance?: SshConnectionAppearance | null;
      category?: string;
      sortOrder?: number;
      lastUsedAt?: number;
      archivedAt?: number | null;
      deletedAt?: number | null;
    }
  ): Promise<SavedSshConnection> {
    const body: Record<string, unknown> = { ...patch };
    if (patch.color !== undefined) body.color = normalizeSshColor(patch.color);
    if (patch.protocol !== undefined) body.protocol = normalizeConnectionProtocol(patch.protocol);
    if (patch.category !== undefined) body.category = normalizeSshCategory(patch.category);
    if (patch.sortOrder !== undefined) body.sortOrder = normalizeSshSortOrder(patch.sortOrder);
    if (patch.appearance !== undefined) {
      body.appearance = patch.appearance === null ? null : normalizeSshAppearance(patch.appearance) || null;
    }
    if (patch.archivedAt !== undefined) {
      body.archivedAt = patch.archivedAt && patch.archivedAt > 0 ? patch.archivedAt : null;
    }
    if (patch.deletedAt !== undefined) {
      body.deletedAt = patch.deletedAt && patch.deletedAt > 0 ? patch.deletedAt : null;
    }
    const res = await fetch(`${SSH_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update SSH connection');
    return mapRow(data.connection);
  },

  /** Soft-delete by default (recycle bin). Pass permanent:true to purge. */
  async remove(id: string, opts?: { permanent?: boolean }): Promise<SavedSshConnection | null> {
    const qs = opts?.permanent ? '?permanent=1' : '';
    const res = await fetch(`${SSH_BASE}/${encodeURIComponent(id)}${qs}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to delete SSH connection');
    if (opts?.permanent) return null;
    return data.connection ? mapRow(data.connection) : null;
  },

  async reorder(
    items: Array<{ id: string; category: string; sortOrder: number }>
  ): Promise<SavedSshConnection[]> {
    const res = await fetch(`${SSH_BASE}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        items: items.map((item) => ({
          id: item.id,
          category: normalizeSshCategory(item.category),
          sortOrder: normalizeSshSortOrder(item.sortOrder),
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to reorder SSH connections');
    const list = Array.isArray(data.connections) ? data.connections : [];
    return list.map(mapRow);
  },

  async bulkUpsert(connections: SavedSshConnection[]): Promise<SavedSshConnection[]> {
    const res = await fetch(`${SSH_BASE}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        connections: connections.map((c) => ({
          ...c,
          protocol: normalizeConnectionProtocol(c.protocol),
          color: normalizeSshColor(c.color),
          category: normalizeSshCategory(c.category),
          sortOrder: normalizeSshSortOrder(c.sortOrder),
          appearance: normalizeSshAppearance(c.appearance) || null,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to import SSH connections');
    const list = Array.isArray(data.connections) ? data.connections : [];
    return list.map(mapRow);
  },
};
