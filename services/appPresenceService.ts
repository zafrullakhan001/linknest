import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();
const VISITOR_KEY_STORAGE = 'linknest_visitor_key';

export type AppPresenceCounts = {
  count: number;
  guests: number;
  signedIn: number;
};

function getOrCreateVisitorKey(): string {
  try {
    let key = localStorage.getItem(VISITOR_KEY_STORAGE);
    if (!key || !/^[a-zA-Z0-9_-]{8,64}$/.test(key)) {
      key = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
      localStorage.setItem(VISITOR_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return `tmp${Date.now().toString(36)}`;
  }
}

function parseCounts(data: unknown): AppPresenceCounts | null {
  if (!data || typeof data !== 'object') return null;
  const item = data as Record<string, unknown>;
  const count = typeof item.count === 'number' ? item.count : Number(item.count);
  if (!Number.isFinite(count) || count < 0) return null;
  const guests = typeof item.guests === 'number' ? item.guests : Number(item.guests);
  const signedIn = typeof item.signedIn === 'number' ? item.signedIn : Number(item.signedIn);
  return {
    count: Math.floor(count),
    guests: Number.isFinite(guests) && guests >= 0 ? Math.floor(guests) : 0,
    signedIn: Number.isFinite(signedIn) && signedIn >= 0 ? Math.floor(signedIn) : 0,
  };
}

async function parsePresenceResponse(response: Response): Promise<AppPresenceCounts | null> {
  if (!response.ok) return null;
  try {
    return parseCounts(await response.json());
  } catch {
    return null;
  }
}

export const heartbeatAppPresence = async (): Promise<AppPresenceCounts | null> => {
  try {
    const response = await fetch(`${API_BASE}/app-presence`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorKey: getOrCreateVisitorKey() }),
    });
    return parsePresenceResponse(response);
  } catch {
    return null;
  }
};

export const leaveAppPresence = (): void => {
  const url = `${API_BASE}/app-presence`;
  const body = JSON.stringify({ visitorKey: getOrCreateVisitorKey(), action: 'leave' });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    // Fall through to fetch
  }
  try {
    void fetch(url, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch {
    // Ignore unload failures
  }
};
