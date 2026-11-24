// User alarms stored in the backend DB.
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
const ALARM_BASE = `${API_BASE}/alarms`;

export interface DbAlarm {
  id: number;
  time: string; // HH:MM
  label: string;
  enabled: number; // 0/1
  created_at: number;
  updated_at: number;
}

export const alarmService = {
  async list(): Promise<DbAlarm[]> {
    const res = await fetch(ALARM_BASE, { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load alarms');
    return data.alarms || [];
  },

  async create(time: string, label: string, enabled: boolean = true): Promise<DbAlarm> {
    const res = await fetch(ALARM_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ time, label, enabled }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create alarm');
    return data.alarm as DbAlarm;
  },

  async update(id: number, patch: { time?: string; label?: string; enabled?: boolean }): Promise<DbAlarm> {
    const res = await fetch(`${ALARM_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update alarm');
    return data.alarm as DbAlarm;
  },

  async remove(id: number): Promise<void> {
    const res = await fetch(`${ALARM_BASE}/${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any).error || 'Failed to delete alarm');
  },
};

