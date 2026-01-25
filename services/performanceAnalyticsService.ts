import { resolveApiBase } from './apiHelpers';

const API_BASE = resolveApiBase();

export interface AnalyticsLocation {
  country_code: string;
  country_name: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface AnalyticsClientConfig {
  enabled: boolean;
  sampleRate?: number;
  trackAnonymous?: boolean;
  trackLogins?: boolean;
  beaconUrls?: string[];
  collectUrl?: string;
  dashboardUrl?: string;
  userId?: number | null;
  username?: string | null;
  sessionId?: string;
  location?: AnalyticsLocation;
  needsLocation?: boolean;
  reason?: string;
}

export interface AnalyticsMetric {
  url: string;
  // Client only: the browser should never emit server measurements
  measurement_type: 'client';
  full_response_time: number;
  dns_lookup_time?: number | null;
  tcp_connection_time?: number | null;
  tls_handshake_time?: number | null;
  time_to_first_byte?: number | null;
  download_time?: number | null;
  http_status_code?: number | null;
  error_message?: string | null;
  page_url?: string | null;
  // LinkNest context
  tile_id?: string;
  link_id?: string;
  link_url_normalized?: string;
  // Result classification
  ok?: boolean;
  error_category?: string | null;
  response_type?: string | null;
  redirected?: boolean;
  final_url?: string | null;
  // Request metadata
  method?: string;
  cache_mode?: string;
  timeout_ms?: number;
  attempted_at?: number; // epoch ms
  device_type?: string;
  browser_name?: string;
  browser_version?: string;
  os_name?: string;
  screen_resolution?: string;
  connection_type?: string;
  // Optional location override (session fallback exists on server)
  country_code?: string;
  country_name?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

let cachedConfig: { value: AnalyticsClientConfig; at: number } | null = null;

type CachedGeo = {
  lat: number;
  lon: number;
  accuracy?: number;
  ts: number; // epoch ms
};

const GEO_CACHE_KEY = 'linknest_analytics_geo';
const GEO_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

function shouldSample(sampleRate: number | undefined): boolean {
  const sr = typeof sampleRate === 'number' ? sampleRate : 0.1;
  if (sr >= 1) return true;
  if (sr <= 0) return false;
  return Math.random() <= sr;
}

function readCachedGeo(): CachedGeo | null {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGeo;
    if (!parsed || typeof parsed.ts !== 'number') return null;
    if (Date.now() - parsed.ts > GEO_CACHE_MAX_AGE_MS) return null;
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) return null;
    if (Math.abs(parsed.lat) < 0.0001 && Math.abs(parsed.lon) < 0.0001) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedGeo(geo: CachedGeo) {
  try {
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geo));
  } catch {
    // ignore
  }
}

async function getPreciseGeo(opts: { allowPrompt: boolean }): Promise<CachedGeo | null> {
  if (!navigator.geolocation) return null;

  // Avoid prompting unless explicitly allowed (matches Weather widget UX, but quieter by default)
  // Use Permissions API if available.
  try {
    // @ts-expect-error Permissions API typing differs across browsers
    const perm = navigator.permissions ? await navigator.permissions.query({ name: 'geolocation' }) : null;
    if (perm && perm.state && perm.state !== 'granted' && !opts.allowPrompt) {
      return null;
    }
    if (perm && perm.state === 'denied') {
      return null;
    }
  } catch {
    // If permissions query fails, we fall back to allowPrompt gating
    if (!opts.allowPrompt) return null;
  }

  const geo = await new Promise<CachedGeo | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now()
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true, // match Weather widget (best available precision)
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      }
    );
  });

  if (!geo) return null;
  if (!Number.isFinite(geo.lat) || !Number.isFinite(geo.lon)) return null;
  if (Math.abs(geo.lat) < 0.0001 && Math.abs(geo.lon) < 0.0001) return null;

  writeCachedGeo(geo);
  return geo;
}

function getUAInfo() {
  const ua = navigator.userAgent || '';

  const isMobile = /Mobile|Android|iPhone|iPad|IEMobile/.test(ua);
  const device_type = isMobile ? 'mobile' : 'desktop';

  const browserMatch = ua.match(/(Edg|Edge|Chrome|Firefox|Safari|Opera)\/(\d+)/);
  const browser_name = browserMatch ? (browserMatch[1] === 'Edg' ? 'Edge' : browserMatch[1]) : 'Unknown';
  const browser_version = browserMatch ? browserMatch[2] : '';

  // Basic OS detection (best-effort)
  let os_name = 'Unknown';
  if (/Windows/.test(ua)) os_name = 'Windows';
  else if (/Mac OS X/.test(ua)) os_name = 'Mac';
  else if (/Android/.test(ua)) os_name = 'Android';
  else if (/(iPhone|iPad|iPod)/.test(ua)) os_name = 'iOS';
  else if (/Linux/.test(ua)) os_name = 'Linux';

  const screen_resolution = `${window.screen?.width || 0}x${window.screen?.height || 0}`;
  // @ts-expect-error navigator.connection is not standard everywhere
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const connection_type = conn?.effectiveType || conn?.type || 'unknown';

  return { device_type, browser_name, browser_version, os_name, screen_resolution, connection_type };
}

function normalizeLinkUrl(url: string): string {
  const raw = (url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    // Avoid cardinality explosion: drop fragment + query by default.
    u.hash = '';
    u.search = '';
    u.hostname = u.hostname.toLowerCase();
    // Normalize trailing slash (except root)
    if (u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    return raw;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export const performanceAnalyticsService = {
  async getConfig(force = false): Promise<AnalyticsClientConfig> {
    const now = Date.now();
    if (!force && cachedConfig && now - cachedConfig.at < 60_000) {
      return cachedConfig.value;
    }

    const cfg = await fetchJson<AnalyticsClientConfig>(`${API_BASE}/analytics/config`);
    cachedConfig = { value: cfg, at: now };
    return cfg;
  },

  /**
   * Ensure we have best-available location.
   * - Uses browser geolocation when possible (more accurate)
   * - Falls back to IP-based lookup server-side
   */
  async ensureLocation(
    config?: AnalyticsClientConfig,
    opts?: { allowPrompt?: boolean }
  ): Promise<AnalyticsClientConfig> {
    const cfg = config ?? (await this.getConfig());
    if (!cfg.enabled) return cfg;

    // If we already have a plausible location, skip.
    if (!cfg.needsLocation && readCachedGeo()) {
      return cfg;
    }

    // First: attempt to capture precise browser coordinates (like Weather widget)
    const allowPrompt = opts?.allowPrompt === true;
    const geo = await getPreciseGeo({ allowPrompt });

    // Store browser geolocation in server session (works for both authenticated and anonymous users)
    // This enables reverse geocoding and populates session with accurate location data
    if (geo) {
      try {
        await fetchJson(`${API_BASE}/analytics/update-location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: geo.lat,
            longitude: geo.lon
          })
        });
      } catch {
        // ignore - geolocation will still be included in metrics from cache
      }
    } else if (cfg.needsLocation) {
      // Fallback to IP-based location if browser geolocation unavailable
      try {
        await fetchJson(`${API_BASE}/analytics/update-location`, { method: 'POST' });
      } catch {
        // ignore
      }
    }

    // Refresh config to pick up session updates
    return await this.getConfig(true);
  },

  /**
   * Measure a URL from the browser (best-effort).
   * Uses a HEAD request with mode:no-cors to avoid preflight/CORS issues.
   */
  async measureUrlLatency(
    url: string,
    timeoutMs = 5000
  ): Promise<{
    ok: boolean;
    durationMs: number;
    httpStatus: number | null;
    responseType: string | null;
    redirected: boolean;
    finalUrl: string | null;
    errorCategory: string | null;
    error?: string;
    attemptedAt: number;
    method: string;
    cacheMode: string;
    timeoutMs: number;
  }> {
    const attemptedAt = Date.now();
    const start = performance.now();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const method = 'HEAD';
    const cacheMode: RequestCache = 'no-store';

    try {
      const res = await fetch(url, {
        method,
        mode: 'no-cors',
        cache: cacheMode,
        signal: controller.signal
      });

      const durationMs = Math.round(performance.now() - start);
      // In no-cors, status is often 0 (opaque). Still useful as "request completed".
      const responseType = (res as any)?.type ? String((res as any).type) : null;
      const redirected = !!(res as any)?.redirected;
      const finalUrl = (res as any)?.url ? String((res as any).url) : null;
      const httpStatus = typeof (res as any)?.status === 'number' ? (res as any).status : null;
      const errorCategory = responseType === 'opaque' ? 'cors_opaque' : null;

      return {
        ok: true,
        durationMs,
        httpStatus,
        responseType,
        redirected,
        finalUrl,
        errorCategory,
        attemptedAt,
        method,
        cacheMode: String(cacheMode),
        timeoutMs
      };
    } catch (e: any) {
      const durationMs = Math.round(performance.now() - start);
      const name = String(e?.name || '');
      const msg = e?.message || 'Request failed';
      let errorCategory: string = 'network';
      if (name === 'AbortError') errorCategory = 'timeout';

      return {
        ok: false,
        durationMs,
        httpStatus: null,
        responseType: null,
        redirected: false,
        finalUrl: null,
        errorCategory,
        error: msg,
        attemptedAt,
        method,
        cacheMode: String(cacheMode),
        timeoutMs
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  },

  async sendMetrics(metrics: AnalyticsMetric[], opts?: { force?: boolean }): Promise<void> {
    if (!metrics.length) return;

    let cfg = await this.getConfig();
    if (!cfg.enabled) return;
    if (!opts?.force && !shouldSample(cfg.sampleRate)) return;

    // Safety net: only allow client measurements to be sent from the browser.
    metrics = metrics.filter(m => (m.measurement_type || 'client') === 'client');
    if (!metrics.length) return;

    // Ensure we attach best-available location.
    // - For explicit user actions (force), we can prompt for geolocation.
    // - For background sends, do not prompt; rely on cached/session/IP fallback.
    try {
      const loc = cfg.location;
      const hasLoc =
        !!loc &&
        Number.isFinite(loc.latitude) &&
        Number.isFinite(loc.longitude) &&
        Math.abs(loc.latitude) > 0.0001 &&
        Math.abs(loc.longitude) > 0.0001;
      if (!hasLoc || cfg.needsLocation) {
        cfg = await this.ensureLocation(cfg, { allowPrompt: opts?.force === true });
      }
    } catch {
      // ignore
    }

    const ua = getUAInfo();
    const cachedGeo = readCachedGeo();
    const loc = cfg.location;

    const locToUse = cachedGeo
      ? {
          country_code: loc?.country_code || 'XX',
          country_name: loc?.country_name || 'Unknown',
          region: loc?.region || 'Unknown',
          city: loc?.city || 'Unknown',
          latitude: cachedGeo.lat,
          longitude: cachedGeo.lon
        }
      : loc;

    const payload = metrics.map(m => ({
      ...ua,
      user_id: cfg.userId,
      username: cfg.username,
      page_url: (typeof window !== 'undefined' && window.location ? window.location.href : null),
      ...(locToUse ? {
        country_code: locToUse.country_code,
        country_name: locToUse.country_name,
        region: locToUse.region,
        city: locToUse.city,
        latitude: locToUse.latitude,
        longitude: locToUse.longitude
      } : {}),
      ...m,
      link_url_normalized: m.link_url_normalized || normalizeLinkUrl(m.url)
    }));

    await fetchJson(`${API_BASE}/analytics/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
};

