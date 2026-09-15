import { resolveApiBase } from './apiHelpers';

export type ShortUrlTargetType = 'tile' | 'tab' | 'section' | 'link';

export interface RecycleShortUrlResult {
  code: string;
  shortUrl: string;
  targetType: ShortUrlTargetType;
  targetId: string;
}

export interface ShortUrlRotationByType {
  tile: number;
  tab: number;
  section: number;
  link: number;
}

export interface ShortUrlRotationLog {
  id: number;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  rotatedBy: number | null;
  rotatedByUsername: string | null;
  ipAddress: string | null;
  scope: string;
  activeBefore: number;
  rotatedCount: number;
  skippedCount: number;
  errorCount: number;
  byType: ShortUrlRotationByType;
  status: 'completed' | 'failed' | string;
  errorMessage: string | null;
}

export interface ShortUrlRotationStats {
  active: { total: number; tile: number; tab: number; section: number; link: number };
  revoked: number;
  spacesShowingShortUrls: number;
  oldestActiveAt: number | null;
  newestActiveAt: number | null;
  oldestActiveAgeSeconds: number | null;
  newestActiveAgeSeconds: number | null;
  lifetimeRuns: number;
  lifetimeRotated: number;
  avgDurationMs: number | null;
  lastRun: ShortUrlRotationLog | null;
}

export interface ShortUrlRotationOverview {
  stats: ShortUrlRotationStats;
  logs: ShortUrlRotationLog[];
  total: number;
  page: number;
  perPage: number;
}

export interface RotateAllShortUrlsResult {
  run: ShortUrlRotationLog;
  rotatedCount: number;
  stats: ShortUrlRotationStats;
}

export async function recycleShortUrl(
  targetType: ShortUrlTargetType,
  targetId: string
): Promise<RecycleShortUrlResult> {
  const res = await fetch(`${resolveApiBase()}/short-urls/recycle`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetType, targetId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to recycle short URL');
  }
  return data as RecycleShortUrlResult;
}

export async function getShortUrlRotationOverview(params: {
  page?: number;
  perPage?: number;
} = {}): Promise<ShortUrlRotationOverview> {
  const search = new URLSearchParams();
  if (params.page) search.set('page', String(params.page));
  if (params.perPage) search.set('per_page', String(params.perPage));
  const qs = search.toString();
  const res = await fetch(`${resolveApiBase()}/short-urls/rotation${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load short URL rotation stats');
  }
  return {
    stats: data.stats,
    logs: data.logs || [],
    total: data.total || 0,
    page: data.page || 1,
    perPage: data.perPage || 25,
  };
}

export async function rotateAllShortUrls(): Promise<RotateAllShortUrlsResult> {
  const res = await fetch(`${resolveApiBase()}/short-urls/rotate-all`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data && data.run) {
      return data as RotateAllShortUrlsResult;
    }
    throw new Error(data.error || 'Failed to rotate short URLs');
  }
  return data as RotateAllShortUrlsResult;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
