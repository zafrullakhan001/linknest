// User VNC websockify connections stored in the backend DB (authenticated users).
// Passwords are never stored. Guests use localStorage in the widget instead.

import { SSH_CONNECTION_COLORS, normalizeSshColor } from './sshConnectionService';

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
const VNC_BASE = `${API_BASE}/vnc-connections`;

export { SSH_CONNECTION_COLORS as VNC_CONNECTION_COLORS };
export { normalizeSshColor as normalizeVncColor };

export interface SavedVncConnection {
  id: string;
  name: string;
  wsUrl: string;
  tags: string[];
  notes?: string;
  color?: string;
  viewOnly?: boolean;
  scaleViewport?: boolean;
  createdAt: number;
  lastUsedAt?: number;
}

function mapRow(row: any): SavedVncConnection {
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
    viewOnly: Boolean(row.viewOnly ?? row.view_only),
    scaleViewport: row.scaleViewport !== false && row.scale_viewport !== 0 && row.scale_viewport !== false,
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : Number(row.created_at) || Date.now(),
    lastUsedAt:
      typeof row.lastUsedAt === 'number'
        ? row.lastUsedAt
        : row.last_used_at != null
          ? Number(row.last_used_at) || undefined
          : undefined,
  };
}

export const vncConnectionService = {
  async list(): Promise<SavedVncConnection[]> {
    const res = await fetch(VNC_BASE, { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load VNC connections');
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
    viewOnly?: boolean;
    scaleViewport?: boolean;
  }): Promise<SavedVncConnection> {
    const res = await fetch(VNC_BASE, {
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
        viewOnly: Boolean(input.viewOnly),
        scaleViewport: input.scaleViewport !== false,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create VNC connection');
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
      viewOnly?: boolean;
      scaleViewport?: boolean;
      lastUsedAt?: number;
    }
  ): Promise<SavedVncConnection> {
    const body: Record<string, unknown> = { ...patch };
    if (patch.color !== undefined) body.color = normalizeSshColor(patch.color);
    const res = await fetch(`${VNC_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update VNC connection');
    return mapRow(data.connection);
  },

  async remove(id: string): Promise<void> {
    const res = await fetch(`${VNC_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to delete VNC connection');
  },

  async bulkUpsert(connections: SavedVncConnection[]): Promise<SavedVncConnection[]> {
    const res = await fetch(`${VNC_BASE}/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        connections: connections.map((c) => ({
          ...c,
          color: normalizeSshColor(c.color),
          viewOnly: Boolean(c.viewOnly),
          scaleViewport: c.scaleViewport !== false,
        })),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to import VNC connections');
    const list = Array.isArray(data.connections) ? data.connections : [];
    return list.map(mapRow);
  },
};
