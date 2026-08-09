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

export interface SavedSshConnection {
  id: string;
  name: string;
  wsUrl: string;
  tags: string[];
  notes?: string;
  color?: string;
  createdAt: number;
  lastUsedAt?: number;
}

export function normalizeSshColor(raw: unknown): string {
  const c = String(raw || '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  return '#0ea5e9';
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
    tags,
    notes: row.notes != null && String(row.notes) ? String(row.notes) : undefined,
    color: normalizeSshColor(row.color),
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : Number(row.created_at) || Date.now(),
    lastUsedAt:
      typeof row.lastUsedAt === 'number'
        ? row.lastUsedAt
        : row.last_used_at != null
          ? Number(row.last_used_at) || undefined
          : undefined,
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
    tags?: string[];
    notes?: string;
    color?: string;
  }): Promise<SavedSshConnection> {
    const res = await fetch(SSH_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id: input.id,
        name: input.name,
        wsUrl: input.wsUrl,
        tags: input.tags || [],
        notes: input.notes || '',
        color: normalizeSshColor(input.color),
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
      tags?: string[];
      notes?: string;
      color?: string;
      lastUsedAt?: number;
    }
  ): Promise<SavedSshConnection> {
    const body: Record<string, unknown> = { ...patch };
    if (patch.color !== undefined) body.color = normalizeSshColor(patch.color);
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

  async remove(id: string): Promise<void> {
    const res = await fetch(`${SSH_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to delete SSH connection');
  },

  async bulkUpsert(connections: SavedSshConnection[]): Promise<SavedSshConnection[]> {
    const res = await fetch(`${SSH_BASE}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        connections: connections.map((c) => ({
          ...c,
          color: normalizeSshColor(c.color),
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to import SSH connections');
    const list = Array.isArray(data.connections) ? data.connections : [];
    return list.map(mapRow);
  },
};
