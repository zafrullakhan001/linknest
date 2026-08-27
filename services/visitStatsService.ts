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
