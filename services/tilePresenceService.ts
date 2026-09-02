import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();

export type TilePresenceMode = 'viewing' | 'editing';

export type TilePresenceViewer = {
  userId: number;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  mode: TilePresenceMode;
  lastSeen: number;
};

function parseViewers(data: unknown): TilePresenceViewer[] {
  const raw = (data as { viewers?: unknown })?.viewers;
  if (!Array.isArray(raw)) return [];

  const viewers: TilePresenceViewer[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const userId = typeof item.userId === 'number' ? item.userId : Number(item.userId);
    const username = typeof item.username === 'string' ? item.username.trim() : '';
    if (!Number.isFinite(userId) || userId <= 0 || !username) continue;
    const displayName = typeof item.displayName === 'string' && item.displayName.trim()
      ? item.displayName.trim()
      : null;
    viewers.push({
      userId,
      username,
      displayName,
      isAdmin: item.isAdmin === true || item.isAdmin === 1,
      mode: item.mode === 'editing' ? 'editing' : 'viewing',
      lastSeen: typeof item.lastSeen === 'number' ? item.lastSeen : Number(item.lastSeen) || 0,
    });
  }
  return viewers;
}

async function parsePresenceResponse(response: Response): Promise<TilePresenceViewer[]> {
  if (!response.ok) return [];
  try {
    return parseViewers(await response.json());
  } catch {
    return [];
  }
}

export const getTilePresence = async (tileId: string): Promise<TilePresenceViewer[]> => {
  if (!tileId) return [];
  try {
    const response = await fetch(`${API_BASE}/tiles/${encodeURIComponent(tileId)}/presence`, {
      method: 'GET',
      credentials: 'include',
    });
    return parsePresenceResponse(response);
  } catch {
    return [];
  }
};

export const heartbeatTilePresence = async (
  tileId: string,
  mode: TilePresenceMode
): Promise<TilePresenceViewer[]> => {
  if (!tileId) return [];
  try {
    const response = await fetch(`${API_BASE}/tiles/${encodeURIComponent(tileId)}/presence`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    return parsePresenceResponse(response);
  } catch {
    return [];
  }
};

export const leaveTilePresence = (tileId: string): void => {
  if (!tileId) return;
  const url = `${API_BASE}/tiles/${encodeURIComponent(tileId)}/presence`;
  const body = JSON.stringify({ action: 'leave' });
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
