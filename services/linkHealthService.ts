import { LinkHealth } from '../types';
import { resolveApiBase } from './apiHelpers';
import { urlForHealthProbe } from '../utils/redirectChain';
import {
  type LinkHealthColorContext,
  linkHealthIndicatorDotClassName,
  resolveLinkHealthColorCss,
  resolveLinkHealthColorHex,
  resolveLinkHealthDotStyle,
} from './linkHealthColors';

function healthApi(path: string): string {
  const base = resolveApiBase().replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

// Safety guard so frontend never "spins forever" even if backend/network hangs
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
    const result = await Promise.race([promise, timeoutPromise]);
    return result as T;
  } finally {
    window.clearTimeout(timeoutId!);
    signal?.removeEventListener('abort', onAbort);
  }
}

export interface HealthStats {
  total: number;
  healthy: number;
  broken: number;
  timeout: number;
  restricted: number;
  unknown: number;
  network?: number;
}

export const NETWORK_HEALTH_ERROR = 'Network not reachable — this is not a broken link';

export function isNetworkHealthStatus(status?: string | null): boolean {
  return status === 'network';
}

export function isLikelyClientNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  const msg = error instanceof Error ? error.message : String(error || '');
  return /failed to fetch|networkerror|load failed|network request failed|offline|timed out after|err_name_not_resolved|err_internet_disconnected|err_network_changed|err_connection_refused|err_connection_timed_out|err_address_unreachable/i.test(
    msg
  );
}

export function networkHealthResult(): LinkHealth {
  return {
    status: 'network',
    httpCode: null,
    error: NETWORK_HEALTH_ERROR,
    checkedAt: Math.floor(Date.now() / 1000),
  };
}

export interface UrlInventoryItem {
  kind: 'link' | 'hyperlink';
  id: string;
  url: string;
  label: string;
  tileId: string;
  tileTitle: string;
  tileEmoji: string;
  sourceTab: string;
  tabTitle: string;
  sectionTitle: string;
}

export interface TooltipInventoryItem {
  id: string;
  url: string;
  label: string;
  tooltip: string;
  suggestedTooltip: string;
  reason: 'mismatch' | 'empty';
  tileId: string;
  tileTitle: string;
  tileEmoji: string;
  sourceTab: string;
  tabTitle: string;
  sectionTitle: string;
}

export interface TooltipInventoryResult {
  scanned: number;
  mismatched: number;
  empty: number;
  items: TooltipInventoryItem[];
}

export interface LinkHealthMap {
  [linkId: string]: LinkHealth;
}

/** Apply check-tile results; drop skipped (SSH/etc.) so they never show as Broken. */
function mergeHealthResults(prev: LinkHealthMap, results: Record<string, any>): LinkHealthMap {
  const next = { ...prev };
  for (const [linkId, health] of Object.entries(results || {})) {
    if (!health || health.skipped || health.status == null) {
      delete next[linkId];
      continue;
    }
    next[linkId] = health as LinkHealth;
  }
  return next;
}

export const linkHealthService = {
  /**
   * Get health status for all links
   */
  async getAllHealth(): Promise<LinkHealthMap> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth'), {
        credentials: 'include'
      }),
      8000,
      'getAllHealth'
    );
    if (!response.ok) {
      throw new Error('Failed to fetch link health');
    }
    const data = await response.json();
    return data.health || {};
  },

  /**
   * Get health statistics
   */
  async getStats(): Promise<HealthStats> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/stats'), {
        credentials: 'include'
      }),
      8000,
      'getStats'
    );
    if (!response.ok) {
      throw new Error('Failed to fetch health stats');
    }
    const data = await response.json();
    return data.stats;
  },

  /**
   * Check a single link
   */
  async checkLink(linkId: string): Promise<LinkHealth> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ linkId })
      }),
      8000,
      'checkLink'
    );
    
    if (!response.ok) {
      throw new Error('Failed to check link');
    }
    
    const data = await response.json();
    return data.health;
  },

  /**
   * Check all links in a tile
   */
  async checkTileLinks(tileId: string, force: boolean = true, signal?: AbortSignal): Promise<LinkHealthMap> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/check-tile'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tileId, force }),
        signal
      }),
      18000,
      'checkTileLinks',
      signal
    );
    
    if (!response.ok) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new TypeError('Failed to fetch');
      }
      throw new Error('Failed to check tile links');
    }
    
    const data = await response.json();
    return data.results || {};
  },

  /**
   * Merge check results into a health map, removing skipped non-HTTP links (SSH, etc.).
   */
  mergeResults(prev: LinkHealthMap, results: Record<string, any>): LinkHealthMap {
    return mergeHealthResults(prev, results);
  },

  /**
   * Check all links (admin feature)
   */
  async checkAllLinks(force: boolean = false, maxAge: number = 3600): Promise<{
    checked: number;
    results: { healthy: number; broken: number; timeout: number; unknown: number };
  }> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/check-all'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force, maxAge })
      }),
      30000, // Admin bulk check can legitimately take a bit longer
      'checkAllLinks'
    );
    
    if (!response.ok) {
      throw new Error('Failed to check all links');
    }
    
    return await response.json();
  },

  /**
   * Probe an arbitrary URL (edit-form preview) — returns RTT + HTTP status
   */
  async checkUrl(url: string, signal?: AbortSignal): Promise<{
    url: string;
    scheme: 'http' | 'https' | string;
    health: LinkHealth & { serverLatency?: number; finalUrl?: string | null; redirectCount?: number };
  }> {
    const probeUrl = urlForHealthProbe(url);
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/check-url'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: probeUrl }),
        signal
      }),
      65000,
      'checkUrl'
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to check URL');
    }

    const data = await response.json();
    return {
      url: data.url,
      scheme: data.scheme,
      health: data.health
    };
  },

  /**
   * Probe up to 20 URLs in parallel (guest bookmark space checks).
   */
  async checkUrls(
    urls: string[],
    signal?: AbortSignal
  ): Promise<
    Array<{
      url: string;
      skipped?: boolean;
      health: (LinkHealth & { serverLatency?: number; finalUrl?: string | null; redirectCount?: number }) | null;
    }>
  > {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/check-urls'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ urls }),
        signal
      }),
      35000,
      'checkUrls'
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to check URLs');
    }

    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
  },

  /**
   * Fetch page titles for up to 20 HTTP(S) URLs (bulk-add preview).
   */
  async fetchTitles(
    urls: string[],
    signal?: AbortSignal
  ): Promise<
    Array<{
      url: string;
      skipped?: boolean;
      title: string | null;
      error?: string | null;
    }>
  > {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/fetch-titles'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ urls }),
        signal
      }),
      65000,
      'fetchTitles'
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch titles');
    }

    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
  },

  /**
   * Get health indicator color class (uses CSS vars from Settings when set).
   */
  getHealthColor(status: string): string {
    switch (status) {
      case 'healthy':
      case 'accessible':
      case 'restricted':
        return 'bg-[var(--ln-health-online)]';
      case 'broken':
        return 'bg-[var(--ln-health-broken)]';
      case 'network':
        return 'bg-[var(--ln-health-network)]';
      case 'redirected':
        return 'bg-[var(--ln-health-redirected)]';
      case 'unknown':
      case 'timeout':
        return 'bg-[var(--ln-health-unknown)]';
      case 'checking':
        return 'bg-[var(--ln-health-checking)] animate-pulse';
      default:
        return 'bg-[var(--ln-health-unknown)]';
    }
  },

  /** Color for inline styles (shark fins, guest bookmarks). Uses saved settings when provided. */
  getHealthColorHex(
    status: string,
    colorsSetting?: string | null,
    health?: LinkHealthColorContext | null,
    linkUrl?: string | null
  ): string {
    return resolveLinkHealthColorCss(status, colorsSetting, health, linkUrl);
  },

  /** Inline background color + optional pulse class for status dots. */
  getHealthDotStyle(
    status: string,
    options?: {
      colorsSetting?: string | null;
      health?: LinkHealthColorContext | null;
      linkUrl?: string | null;
      shapeSetting?: string | null;
      size?: 'xs' | 'sm' | 'md';
    }
  ): { backgroundColor: string; className: string } {
    const resolved = resolveLinkHealthDotStyle(
      status,
      options?.colorsSetting,
      options?.health,
      options?.linkUrl,
      options?.shapeSetting
    );
    if (options?.size && options.size !== 'sm') {
      return {
        ...resolved,
        className: linkHealthIndicatorDotClassName(options?.shapeSetting, {
          size: options.size,
          pulsing: status === 'checking',
        }),
      };
    }
    return resolved;
  },

  /**
   * Badge text for a broken link (custom override or default "Broken").
   */
  getBrokenDisplayLabel(link?: { brokenStatusLabel?: string | null } | null): string {
    const custom = typeof link?.brokenStatusLabel === 'string' ? link.brokenStatusLabel.trim() : '';
    return custom || 'Broken';
  },

  /**
   * Get health status label
   */
  getHealthLabel(
    status: string,
    customBrokenLabel?: string | null,
    options?: { expected?: boolean; manual?: boolean; note?: string | null }
  ): string {
    switch (status) {
      case 'healthy':
        return 'Link is working';
      case 'accessible':
        return 'Link is online (may require authentication)';
      case 'broken': {
        const custom = typeof customBrokenLabel === 'string' ? customBrokenLabel.trim() : '';
        const base = custom || 'Link is broken';
        if (options?.expected) return `${base} (expected)`;
        return base;
      }
      case 'network':
        return 'Network not reachable — this is not a broken link';
      case 'timeout':
        return 'Link timed out';
      case 'redirected':
        return 'Link redirected (host reachable; may require sign-in)';
      case 'restricted':
        return 'Link is online (requires authentication)';
      case 'checking':
        return 'Checking...';
      case 'unknown':
        return 'Status unsure';
      default:
        return 'Status unsure';
    }
  },

  async getUrlInventory(): Promise<UrlInventoryItem[]> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/url-inventory'), {
        credentials: 'include',
      }),
      60000,
      'getUrlInventory'
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load URL inventory');
    }
    const data = await response.json();
    return Array.isArray(data.items) ? data.items : [];
  },

  async fixUrls(
    changes: Array<{ id: string; url: string; kind: 'link' | 'hyperlink' }>
  ): Promise<{ updated: number; skipped: number }> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/fix-urls'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ changes }),
      }),
      120000,
      'fixUrls'
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fix URLs');
    }
    const data = await response.json();
    return {
      updated: typeof data.updated === 'number' ? data.updated : 0,
      skipped: typeof data.skipped === 'number' ? data.skipped : 0,
    };
  },

  async getTooltipInventory(): Promise<TooltipInventoryResult> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/tooltip-inventory'), {
        credentials: 'include',
      }),
      60000,
      'getTooltipInventory'
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load tooltip inventory');
    }
    const data = await response.json();
    return {
      scanned: typeof data.scanned === 'number' ? data.scanned : 0,
      mismatched: typeof data.mismatched === 'number' ? data.mismatched : 0,
      empty: typeof data.empty === 'number' ? data.empty : 0,
      items: Array.isArray(data.items) ? data.items : [],
    };
  },

  async syncTooltips(ids: string[]): Promise<{ updated: number; skipped: number }> {
    const response = await withTimeout(
      fetch(healthApi('/linkhealth/sync-tooltips'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ids }),
      }),
      120000,
      'syncTooltips'
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to sync tooltips');
    }
    const data = await response.json();
    return {
      updated: typeof data.updated === 'number' ? data.updated : 0,
      skipped: typeof data.skipped === 'number' ? data.skipped : 0,
    };
  },
};

