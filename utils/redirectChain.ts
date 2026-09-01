import { LinkRedirectHop } from '../types';

export type RedirectHopKind = 'final' | 'scheme' | 'canonical' | 'host' | 'sso' | 'tracking' | 'path';

export type RedirectHopFlag =
  | 'ssl-downgrade'
  | 'ssl-upgrade'
  | 'host-change'
  | 'relative-location'
  | 'protocol-relative'
  | 'permanent'
  | 'temporary'
  | 'method-preserving'
  | 'loop'
  | 'auth-wall'
  | 'error'
  | 'cookies'
  | 'hsts';

export type AdoptSafety = 'yes' | 'caution' | 'no';

export interface ParsedHopUrl {
  href: string;
  scheme: string;
  host: string;
  hostBare: string;
  path: string;
  query: string;
}

export interface QueryParamDiff {
  added: string[];
  removed: string[];
  changed: string[];
  tracking: string[];
}

export interface RedirectChainSummary {
  hopCount: number;
  redirectCount: number;
  finalUrl: string;
  original: ParsedHopUrl | null;
  final: ParsedHopUrl | null;
  kinds: RedirectHopKind[];
  flags: RedirectHopFlag[];
  schemeChanged: boolean;
  hostChanged: boolean;
  pathChanged: boolean;
  queryChanged: boolean;
  mixedScheme: boolean;
  authWall: boolean;
  loop: boolean;
  safeToAdopt: AdoptSafety;
  adoptReason: string;
  cleanedFinalUrl: string | null;
}

const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'twclid',
  'yclid',
  'mc_eid',
  'mc_cid',
  'igshid',
  'si',
  'ncid',
  'cmpid',
  's_cid',
  'ref',
  'ref_src',
  'ref_url',
  'feature',
]);

const SSO_HOST_RE =
  /(^|\.)(okta|onelogin|auth0|pingidentity|login\.microsoftonline|login\.windows|sts\.windows|accounts\.google|signin\.aws|login\.salesforce|adfs)(\.|$)/i;
const SSO_HOST_PREFIX_RE = /^(login|sso|idp|auth|adfs)\./i;
const SSO_PATH_RE = /\/(login|signin|sso|saml2?|oauth2?|oidc|connect\/authorize|adfs|authn|wday\/auth)(\/|$|\?)/i;

export function parseHopUrl(url: string): ParsedHopUrl | null {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    const host = (u.hostname || '').toLowerCase().replace(/\.$/, '');
    return {
      href: u.toString(),
      scheme: (u.protocol || '').replace(/:$/, '').toLowerCase(),
      host,
      hostBare: host.replace(/^www\./, ''),
      path: u.pathname || '/',
      query: u.search || '',
    };
  } catch {
    return null;
  }
}

export function isTrackingQueryKey(key: string): boolean {
  const k = (key || '').toLowerCase();
  if (TRACKING_QUERY_KEYS.has(k)) return true;
  if (k.startsWith('utm_') || k.startsWith('hsa_') || k.startsWith('mtm_') || k.startsWith('pk_')) return true;
  return false;
}

export function stripTrackingParams(url: string): string | null {
  try {
    const parsed = new URL(url);
    let changed = false;
    for (const key of [...parsed.searchParams.keys()]) {
      if (isTrackingQueryKey(key)) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }
    if (!changed) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function looksLikeSsoUrl(url: string): boolean {
  const parsed = parseHopUrl(url);
  if (!parsed) return false;
  if (SSO_HOST_RE.test(parsed.host) || SSO_HOST_PREFIX_RE.test(parsed.host)) return true;
  return SSO_PATH_RE.test(`${parsed.path}${parsed.query}`);
}

export function httpStatusText(code: number): string {
  const map: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    303: 'See Other',
    304: 'Not Modified',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    407: 'Proxy Auth Required',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return map[code] || '';
}

export function redirectClassLabel(code: number): string | null {
  if (code === 301 || code === 308) return 'Permanent';
  if (code === 302 || code === 303 || code === 307) return 'Temporary';
  return null;
}

export function kindLabel(kind: RedirectHopKind): string {
  switch (kind) {
    case 'scheme':
      return 'Scheme';
    case 'canonical':
      return 'Canonical';
    case 'host':
      return 'Host change';
    case 'sso':
      return 'SSO / login';
    case 'tracking':
      return 'Tracking';
    case 'path':
      return 'Path';
    default:
      return 'Final';
  }
}

export function flagLabel(flag: RedirectHopFlag): string {
  switch (flag) {
    case 'ssl-downgrade':
      return 'HTTPS → HTTP';
    case 'ssl-upgrade':
      return 'HTTP → HTTPS';
    case 'host-change':
      return 'Host changed';
    case 'relative-location':
      return 'Relative Location';
    case 'protocol-relative':
      return 'Protocol-relative';
    case 'permanent':
      return 'Permanent';
    case 'temporary':
      return 'Temporary';
    case 'method-preserving':
      return 'Keeps method';
    case 'loop':
      return 'Loop';
    case 'auth-wall':
      return 'Auth wall';
    case 'error':
      return 'Error';
    case 'cookies':
      return 'Set-Cookie';
    case 'hsts':
      return 'HSTS';
    default:
      return flag;
  }
}

export function nextHopUrl(hop: LinkRedirectHop): string | undefined {
  return hop.locationResolved || hop.location || undefined;
}

export function classifyHopKind(fromUrl: string, toUrl: string | undefined, isLast: boolean): RedirectHopKind {
  if (isLast || !toUrl) return 'final';
  const from = parseHopUrl(fromUrl);
  const to = parseHopUrl(toUrl);
  if (!from || !to) return 'path';
  if (looksLikeSsoUrl(toUrl) && from.hostBare !== to.hostBare) return 'sso';
  if (from.hostBare !== to.hostBare) return 'host';
  const schemeOnly =
    from.scheme !== to.scheme && from.hostBare === to.hostBare && from.path === to.path && from.query === to.query;
  if (schemeOnly) return 'scheme';
  const wwwOnly = from.host !== to.host && from.hostBare === to.hostBare && from.path === to.path && from.query === to.query && from.scheme === to.scheme;
  const slashOnly =
    from.hostBare === to.hostBare &&
    from.scheme === to.scheme &&
    from.query === to.query &&
    (from.path.replace(/\/+$/, '') || '/') === (to.path.replace(/\/+$/, '') || '/');
  if (wwwOnly || (slashOnly && from.path !== to.path && from.host === to.host)) return 'canonical';
  const tracking = queryParamDiff(fromUrl, toUrl);
  if (
    from.hostBare === to.hostBare &&
    from.path === to.path &&
    tracking.tracking.length > 0 &&
    tracking.added.filter((k) => !isTrackingQueryKey(k)).length === 0 &&
    tracking.removed.filter((k) => !isTrackingQueryKey(k)).length === 0
  ) {
    return 'tracking';
  }
  return 'path';
}

export function queryParamDiff(fromUrl: string, toUrl: string): QueryParamDiff {
  const empty: QueryParamDiff = { added: [], removed: [], changed: [], tracking: [] };
  try {
    const a = new URL(fromUrl);
    const b = new URL(toUrl);
    const keys = new Set([...a.searchParams.keys(), ...b.searchParams.keys()]);
    for (const key of keys) {
      const av = a.searchParams.getAll(key).join(',');
      const bv = b.searchParams.getAll(key).join(',');
      if (av === bv) continue;
      if (av && !bv) empty.removed.push(key);
      else if (!av && bv) empty.added.push(key);
      else empty.changed.push(key);
      if (isTrackingQueryKey(key)) empty.tracking.push(key);
    }
    return empty;
  } catch {
    return empty;
  }
}

export function hopFlags(hop: LinkRedirectHop, toUrl?: string): RedirectHopFlag[] {
  const flags: RedirectHopFlag[] = [];
  const from = parseHopUrl(hop.url);
  const to = parseHopUrl(toUrl || nextHopUrl(hop) || '');
  if (from && to) {
    if (from.scheme === 'https' && to.scheme === 'http') flags.push('ssl-downgrade');
    if (from.scheme === 'http' && to.scheme === 'https') flags.push('ssl-upgrade');
    if (from.hostBare !== to.hostBare) flags.push('host-change');
  }
  if (hop.locationRelative) flags.push('relative-location');
  if (hop.locationProtocolRelative) flags.push('protocol-relative');
  if (hop.httpCode === 301 || hop.httpCode === 308) flags.push('permanent');
  if (hop.httpCode === 302 || hop.httpCode === 303 || hop.httpCode === 307) flags.push('temporary');
  if (hop.methodPreserving) flags.push('method-preserving');
  if (hop.loop) flags.push('loop');
  if (hop.httpCode === 401 || hop.httpCode === 403) flags.push('auth-wall');
  if (hop.error) flags.push('error');
  if (hop.setCookieNames && hop.setCookieNames.length > 0) flags.push('cookies');
  if (hop.hsts) flags.push('hsts');
  return flags;
}

export function summarizeChain(originalUrl: string, hops: LinkRedirectHop[]): RedirectChainSummary {
  const hopCount = hops.length;
  const redirectCount = Math.max(0, hopCount - 1);
  const finalUrl = hops.length ? hops[hops.length - 1].url : originalUrl;
  const original = parseHopUrl(originalUrl);
  const final = parseHopUrl(finalUrl);
  const kinds: RedirectHopKind[] = hops.map((hop, idx) => {
    const isLast = idx === hops.length - 1;
    return classifyHopKind(hop.url, isLast ? undefined : nextHopUrl(hop) || hops[idx + 1]?.url, isLast);
  });
  const flagSet = new Set<RedirectHopFlag>();
  hops.forEach((hop, idx) => {
    const to = nextHopUrl(hop) || hops[idx + 1]?.url;
    hopFlags(hop, to).forEach((f) => flagSet.add(f));
  });
  const flags = [...flagSet];
  const mixedScheme = flags.includes('ssl-downgrade');
  const loop = flags.includes('loop') || hops.some((h) => h.loop);
  const last = hops[hops.length - 1];
  const lastCode = last?.httpCode ?? 0;
  const authWall = lastCode === 401 || lastCode === 403 || looksLikeSsoUrl(finalUrl);
  const schemeChanged = !!(original && final && original.scheme !== final.scheme);
  const hostChanged = !!(original && final && original.hostBare !== final.hostBare);
  const pathChanged = !!(original && final && original.path !== final.path);
  const queryChanged = !!(original && final && original.query !== final.query);

  let safeToAdopt: AdoptSafety = 'yes';
  let adoptReason = 'Final URL looks like a stable bookmark target.';
  if (!last || lastCode < 200 || lastCode >= 300) {
    safeToAdopt = 'no';
    adoptReason = 'Final hop did not return HTTP 2xx — don’t adopt this URL yet.';
  } else if (loop) {
    safeToAdopt = 'no';
    adoptReason = 'Redirect loop detected.';
  } else if (lastCode === 401 || lastCode === 403) {
    safeToAdopt = 'no';
    adoptReason = 'Landed on an auth wall (401/403), not the bookmark target.';
  } else if (kinds.includes('sso') || hostChanged || flags.includes('temporary') || mixedScheme) {
    safeToAdopt = 'caution';
    const bits: string[] = [];
    if (kinds.includes('sso')) bits.push('SSO / login hop');
    if (flags.includes('temporary')) bits.push('temporary (302/307) redirect');
    if (hostChanged) bits.push('different host');
    if (mixedScheme) bits.push('HTTPS→HTTP hop');
    adoptReason = `Caution: ${bits.join(', ')}. Final URL may be session-specific.`;
  } else if (kinds.every((k) => k === 'final' || k === 'scheme' || k === 'canonical' || k === 'path')) {
    safeToAdopt = 'yes';
    adoptReason = 'Same site with scheme/canonical/path hops — safe to update the bookmark.';
  }

  return {
    hopCount,
    redirectCount,
    finalUrl,
    original,
    final,
    kinds: [...new Set(kinds.filter((k) => k !== 'final'))],
    flags,
    schemeChanged,
    hostChanged,
    pathChanged,
    queryChanged,
    mixedScheme,
    authWall: lastCode === 401 || lastCode === 403,
    loop,
    safeToAdopt,
    adoptReason,
    cleanedFinalUrl: stripTrackingParams(finalUrl),
  };
}

export function formatMs(ms?: number | null): string {
  if (ms === undefined || ms === null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatHopTiming(hop: LinkRedirectHop): string {
  const parts: string[] = [];
  if (hop.dnsMs != null) parts.push(`DNS ${formatMs(hop.dnsMs)}`);
  if (hop.connectMs != null) parts.push(`TCP ${formatMs(hop.connectMs)}`);
  if (hop.tlsMs != null) parts.push(`TLS ${formatMs(hop.tlsMs)}`);
  if (hop.ttfbMs != null) parts.push(`TTFB ${formatMs(hop.ttfbMs)}`);
  if (hop.timingMs != null) parts.push(`${formatMs(hop.timingMs)} total`);
  return parts.join(' · ');
}

export function urlsMeaningfullyDifferent(a: string, b: string): boolean {
  const pa = parseHopUrl(a);
  const pb = parseHopUrl(b);
  if (!pa || !pb) return a.trim() !== b.trim();
  return pa.scheme !== pb.scheme || pa.host !== pb.host || pa.path !== pb.path || pa.query !== pb.query;
}

export function buildChainPlainText(originalUrl: string, hops: LinkRedirectHop[], summary: RedirectChainSummary): string {
  const lines: string[] = [
    `Redirect chain for ${originalUrl}`,
    `${summary.hopCount} hop(s) · ${summary.redirectCount} redirect(s) · final ${summary.finalUrl}`,
    '',
  ];
  hops.forEach((hop, idx) => {
    const isLast = idx === hops.length - 1;
    const to = nextHopUrl(hop);
    const kind = classifyHopKind(hop.url, isLast ? undefined : to || hops[idx + 1]?.url, isLast);
    const flags = hopFlags(hop, to).map(flagLabel).join(', ');
    lines.push(
      `Hop ${idx + 1}  HTTP ${hop.httpCode || '—'}  ${httpStatusText(hop.httpCode)}  ${kindLabel(kind)}${hop.timingMs != null ? `  ${formatMs(hop.timingMs)}` : ''}${hop.ip ? `  ${hop.ip}` : ''}`
    );
    lines.push(`  ${hop.url}`);
    if (to && !isLast) lines.push(`  → ${to}`);
    if (flags) lines.push(`  flags: ${flags}`);
    if (hop.error) lines.push(`  error: ${hop.error}`);
    lines.push('');
  });
  return lines.join('\n').trim() + '\n';
}

export function buildCurlCommand(url: string, follow = true): string {
  const escaped = url.replace(/"/g, '\\"');
  const followFlag = follow ? ' -L --max-redirs 55' : '';
  return `curl -sI${followFlag} -A "LinkNest Health Checker/1.0" "${escaped}"`;
}

export function buildHarLog(originalUrl: string, hops: LinkRedirectHop[]): Record<string, unknown> {
  const now = new Date().toISOString();
  const entries = hops.map((hop) => {
    const headers: Array<{ name: string; value: string }> = [];
    if (hop.server) headers.push({ name: 'Server', value: hop.server });
    if (hop.contentType) headers.push({ name: 'Content-Type', value: hop.contentType });
    if (hop.cacheControl) headers.push({ name: 'Cache-Control', value: hop.cacheControl });
    if (hop.hsts) headers.push({ name: 'Strict-Transport-Security', value: 'present' });
    if (hop.wwwAuthenticate) headers.push({ name: 'WWW-Authenticate', value: hop.wwwAuthenticate });
    if (hop.location) headers.push({ name: 'Location', value: hop.location });
    const dns = hop.dnsMs ?? -1;
    const connectAbs = hop.connectMs ?? -1;
    const tlsAbs = hop.tlsMs ?? -1;
    const ttfbAbs = hop.ttfbMs ?? -1;
    const connect = connectAbs >= 0 && dns >= 0 ? Math.max(0, connectAbs - dns) : connectAbs;
    const ssl = tlsAbs >= 0 && connectAbs >= 0 ? Math.max(0, tlsAbs - connectAbs) : tlsAbs;
    const waitBase = tlsAbs >= 0 ? tlsAbs : connectAbs;
    const wait = ttfbAbs >= 0 && waitBase >= 0 ? Math.max(0, ttfbAbs - waitBase) : ttfbAbs;
    return {
      startedDateTime: now,
      time: hop.timingMs ?? 0,
      request: {
        method: hop.requestMethod || 'HEAD',
        url: hop.url,
        httpVersion: hop.httpVersion || 'HTTP/1.1',
        cookies: [],
        headers: [],
        queryString: [],
        headersSize: -1,
        bodySize: 0,
      },
      response: {
        status: hop.httpCode,
        statusText: httpStatusText(hop.httpCode),
        httpVersion: hop.httpVersion || 'HTTP/1.1',
        cookies: (hop.setCookieNames || []).map((name) => ({ name, value: '' })),
        headers,
        content: { size: hop.contentLength ?? 0, mimeType: hop.contentType || 'x-unknown' },
        redirectURL: hop.location || '',
        headersSize: -1,
        bodySize: 0,
      },
      cache: {},
      timings: {
        blocked: -1,
        dns,
        connect,
        ssl,
        send: 0,
        wait,
        receive: 0,
      },
      serverIPAddress: hop.ip || undefined,
      comment: 'LinkNest server HEAD probe',
    };
  });
  return {
    log: {
      version: '1.2',
      creator: { name: 'LinkNest', version: '2.3.8' },
      comment: `Server-side HEAD redirect trace for ${originalUrl}. Not a browser HAR.`,
      entries,
    },
  };
}

export function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function chainExportFilename(url: string, kind: 'json' | 'har'): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/[^\w.-]+/g, '_') || 'redirect-chain';
    } catch {
      return 'redirect-chain';
    }
  })();
  return `redirect-chain-${host}-${Date.now()}.${kind}`;
}
