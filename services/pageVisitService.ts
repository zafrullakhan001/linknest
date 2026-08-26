/**
 * Site-wide public page visit counter (footer display).
 * Counts once per browser session; best-effort and never throws.
 */

function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) {
    return envBase;
  }

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
const SESSION_DEBOUNCE_KEY = 'linknest_page_visit_sent';

export async function recordAndGetPageVisits(): Promise<number | null> {
  try {
    let shouldRecord = true;
    try {
      if (sessionStorage.getItem(SESSION_DEBOUNCE_KEY)) {
        shouldRecord = false;
      } else {
        sessionStorage.setItem(SESSION_DEBOUNCE_KEY, String(Date.now()));
      }
    } catch {
      // sessionStorage unavailable — still attempt to record
    }

    if (shouldRecord) {
      const response = await fetch(`${API_BASE}/page-visits`, {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const count = typeof data?.count === 'number' ? data.count : Number(data?.count);
      return Number.isFinite(count) ? count : null;
    }

    const response = await fetch(`${API_BASE}/page-visits`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    const count = typeof data?.count === 'number' ? data.count : Number(data?.count);
    return Number.isFinite(count) ? count : null;
  } catch (e) {
    console.debug('Page visit recording skipped:', e);
    return null;
  }
}
