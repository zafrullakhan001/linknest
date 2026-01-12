// Custom timezones stored per-user in the backend DB.
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
const TZ_BASE = `${API_BASE}/timezones`;

export interface DbCustomTimezone {
  id: number;
  name: string;
  utc_offset_minutes: number;
  created_at: number;
}

export const customTimezoneService = {
  async list(): Promise<DbCustomTimezone[]> {
    const res = await fetch(TZ_BASE, { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load timezones');
    return data.timezones || [];
  },

  async create(name: string, utcOffsetMinutes: number): Promise<DbCustomTimezone> {
    const res = await fetch(TZ_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, utc_offset_minutes: utcOffsetMinutes }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create timezone');
    return data.timezone as DbCustomTimezone;
  },

  async remove(id: number): Promise<void> {
    const res = await fetch(`${TZ_BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to delete timezone');
  },
};

