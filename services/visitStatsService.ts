const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface VisitStatsSpaceRow {
  id: string;
  title: string;
  emoji: string | null;
  themeColor: string | null;
  group: string | null;
  visibility: string;
  deleted: boolean;
  archived: boolean;
  hitCount: number;
  uniqueVisitors: number;
  lastVisit: number | null;
}

export interface VisitStatsDailyPoint {
  date: string;
  label: string;
  hits: number;
  uniqueVisitors?: number;
}

export interface VisitStatsTotals {
  hitCount: number;
  uniqueVisitors: number;
  guestHits: number;
  userHits: number;
}

export interface VisitStatsDashboard {
  appVisits: number;
  totals: VisitStatsTotals;
  spaceCount: number;
  spacesWithVisits: number;
  days: number;
  retentionDays: number;
  granularity: 'day' | 'week';
  daily: VisitStatsDailyPoint[];
  appDaily: VisitStatsDailyPoint[];
  spaces: VisitStatsSpaceRow[];
}

export type VisitPurgeScope = 'all' | 'spaces' | 'website' | 'daily' | 'space';

export const VISIT_PURGE_CONFIRM: Record<VisitPurgeScope, string> = {
  all: 'PURGE ALL VISITS',
  spaces: 'PURGE SPACE VISITS',
  website: 'PURGE WEBSITE VISITS',
  daily: 'PURGE DAILY HISTORY',
  space: 'PURGE SPACE',
};

export interface VisitPurgeResult {
  success: boolean;
  purge: {
    scope: string;
    deleted: Record<string, number>;
    tileId?: string | null;
  };
  reindex?: {
    indexes: string[];
    analyzed: string[];
    elapsedMs: number;
  };
}

export interface VisitReindexResult {
  success: boolean;
  reindex: {
    indexes: string[];
    analyzed: string[];
    elapsedMs: number;
  };
}

export async function getVisitStatsDashboard(days = 30): Promise<VisitStatsDashboard> {
  const qs = days !== 30 ? `?days=${encodeURIComponent(String(days))}` : '';
  const response = await fetch(`${API_BASE}/visit-stats${qs}`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : 'Failed to load visit statistics'
    );
  }
  return data as VisitStatsDashboard;
}

export async function purgeVisitStats(
  scope: VisitPurgeScope,
  options: { tileId?: string } = {}
): Promise<VisitPurgeResult> {
  const response = await fetch(`${API_BASE}/visit-stats/purge`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scope,
      confirm: VISIT_PURGE_CONFIRM[scope],
      tileId: options.tileId,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to purge visit data');
  }
  return data as VisitPurgeResult;
}

export async function reindexVisitStats(): Promise<VisitReindexResult> {
  const response = await fetch(`${API_BASE}/visit-stats/reindex`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to refresh indexes');
  }
  return data as VisitReindexResult;
}
