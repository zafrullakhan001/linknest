import { resolveApiBase } from './apiHelpers';

function safetyApi(path: string): string {
  const base = resolveApiBase().replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export type UrlSafetyVerdict =
  | 'safe'
  | 'malicious'
  | 'adult'
  | 'suspicious'
  | 'unknown'
  | 'disabled';

export interface UrlSafetyFlag {
  id: string;
  category?: string;
  title: string;
  detail: string;
  source?: string;
  sourceLabel?: string;
  matchedDomain?: string;
}

export interface UrlSafetyMatched {
  domain: string;
  category: string;
  source: string;
}

export interface UrlSafetyCheckResult {
  ok: boolean;
  enabled: boolean;
  url: string;
  host: string;
  verdict: UrlSafetyVerdict;
  flags: UrlSafetyFlag[];
  heuristics?: UrlSafetyFlag[];
  lists_ready: boolean;
  lists_pending: boolean;
  matched: UrlSafetyMatched | null;
  requiresConfirm?: boolean;
  blockMalicious?: boolean;
  allowlisted?: boolean;
  error?: string;
}

export interface UrlSafetyTableInfo {
  name: string;
  purpose: string;
  columns: string[];
  row_count: number;
}

export interface UrlSafetySourceStatus {
  id: string;
  label: string;
  category: string;
  url: string;
  fetched_at: number;
  entry_count: number;
  last_error?: string | null;
  /** Upstream list publish time (unix seconds), when the feed header provides it */
  source_updated_at?: number;
  /** Declared refresh window from the feed header, if any */
  expires_hours?: number | null;
  source_age_seconds?: number | null;
  freshness?: 'fresh' | 'aging' | 'stale' | 'unknown';
}

export interface UrlSafetyStatus {
  ok: boolean;
  enabled: boolean;
  check_adult: boolean;
  block_malicious: boolean;
  lists_ready: boolean;
  total_domains: number;
  by_category: Record<string, number>;
  by_source?: Array<{ source: string; count: number }>;
  manual_count?: number;
  sources: UrlSafetySourceStatus[];
  allowlist_count: number;
  tables?: UrlSafetyTableInfo[];
  storage?: {
    database?: string;
    cache_dir?: string;
    refresh_seconds?: number;
  };
  attribution: string[];
  refresh?: unknown;
}

export interface UrlSafetyDomainRow {
  domain: string;
  category: string;
  source: string;
}

export interface UrlSafetyDomainList {
  ok: boolean;
  total: number;
  page: number;
  page_size: number;
  rows: UrlSafetyDomainRow[];
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  let timeoutId: number;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} request timed out after ${ms}ms`));
    }, ms);
  });
  const onAbort = () => {
    window.clearTimeout(timeoutId!);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return (await Promise.race([promise, timeoutPromise])) as T;
  } finally {
    window.clearTimeout(timeoutId!);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function isMaliciousSafetyVerdict(verdict?: string | null): boolean {
  return verdict === 'malicious';
}

export function safetyRequiresConfirm(result: UrlSafetyCheckResult | null | undefined): boolean {
  if (!result || !result.enabled) return false;
  if (result.requiresConfirm) return true;
  return result.verdict === 'malicious';
}

export function formatSafetyConfirmMessage(result: UrlSafetyCheckResult): string {
  const flag = result.flags.find((f) => f.category === 'malware' || f.category === 'phishing');
  const source = flag?.sourceLabel || flag?.source || 'a threat intelligence list';
  const matched = flag?.matchedDomain || result.matched?.domain || result.host || 'this URL';
  return `This URL is listed as malware/phishing (${matched}) by ${source}. Add it anyway?`;
}

export const urlSafetyService = {
  async checkUrl(url: string, signal?: AbortSignal): Promise<UrlSafetyCheckResult> {
    const trimmed = (url || '').trim();
    if (!trimmed) {
      return {
        ok: true,
        enabled: true,
        url: '',
        host: '',
        verdict: 'unknown',
        flags: [],
        lists_ready: false,
        lists_pending: false,
        matched: null,
      };
    }

    const fetchPromise = fetch(safetyApi('/url-safety/check'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: trimmed }),
      signal,
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || `Safety check failed (${res.status})`);
      }
      return data as UrlSafetyCheckResult;
    });

    return withTimeout(fetchPromise, 60000, 'URL safety check', signal);
  },

  async getStatus(): Promise<UrlSafetyStatus> {
    const res = await fetch(safetyApi('/url-safety/status'), { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Failed to load safety status (${res.status})`);
    }
    return data as UrlSafetyStatus;
  },

  async refresh(): Promise<UrlSafetyStatus> {
    const res = await withTimeout(
      fetch(safetyApi('/url-safety/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      300000,
      'URL safety refresh'
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Failed to refresh lists (${res.status})`);
    }
    const status = data as UrlSafetyStatus & { warning?: string; refresh?: { error?: string } };
    if (status.refresh && typeof status.refresh === 'object' && (status.refresh as { error?: string }).error) {
      throw new Error((status.refresh as { error: string }).error);
    }
    return status;
  },

  async getAllowlist(): Promise<string[]> {
    const res = await fetch(safetyApi('/url-safety/allowlist'), { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Failed to load allowlist (${res.status})`);
    }
    return Array.isArray((data as { allowlist?: string[] }).allowlist)
      ? (data as { allowlist: string[] }).allowlist
      : [];
  },

  async setAllowlist(allowlist: string[]): Promise<string[]> {
    const res = await fetch(safetyApi('/url-safety/allowlist'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowlist }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Failed to save allowlist (${res.status})`);
    }
    return Array.isArray((data as { allowlist?: string[] }).allowlist)
      ? (data as { allowlist: string[] }).allowlist
      : [];
  },

  async listDomains(opts: {
    q?: string;
    category?: string;
    source?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<UrlSafetyDomainList> {
    const params = new URLSearchParams();
    if (opts.q) params.set('q', opts.q);
    if (opts.category) params.set('category', opts.category);
    if (opts.source) params.set('source', opts.source);
    if (opts.page) params.set('page', String(opts.page));
    if (opts.pageSize) params.set('page_size', String(opts.pageSize));
    const qs = params.toString();
    const res = await fetch(safetyApi(`/url-safety/domains${qs ? `?${qs}` : ''}`), {
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Failed to list domains (${res.status})`);
    }
    return data as UrlSafetyDomainList;
  },

  async addDomains(
    domains: string[],
    category: 'malware' | 'phishing' | 'adult' = 'malware'
  ): Promise<{ ok: boolean; added: string[]; skipped: string[]; count: number; status?: UrlSafetyStatus }> {
    const res = await fetch(safetyApi('/url-safety/domains'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains, category }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Failed to add domains (${res.status})`);
    }
    return data as { ok: boolean; added: string[]; skipped: string[]; count: number; status?: UrlSafetyStatus };
  },

  async deleteDomains(
    domains: string[],
    anySource = false
  ): Promise<{ ok: boolean; deleted: number; status?: UrlSafetyStatus }> {
    const res = await fetch(safetyApi('/url-safety/domains'), {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domains, any_source: anySource }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Failed to delete domains (${res.status})`);
    }
    return data as { ok: boolean; deleted: number; status?: UrlSafetyStatus };
  },
};
