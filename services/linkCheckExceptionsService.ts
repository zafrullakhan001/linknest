/**
 * Link Check Exceptions — URLs/hosts skipped by "Check Links" health probes.
 * Stored as JSON string array in settings key `link_check_exceptions`.
 */

export const LINK_CHECK_EXCEPTIONS_SETTING_KEY = 'link_check_exceptions' as const;
export const MAX_LINK_CHECK_EXCEPTIONS = 2000;

/** Normalize a single exception entry for storage / comparison. */
export function normalizeExceptionPattern(raw: string): string | null {
  let value = String(raw ?? '').trim();
  if (!value) return null;

  // Strip surrounding quotes from pasted CSV/JSON fragments
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (!value) return null;

  // Drop fragment / trailing whitespace noise
  value = value.split('#')[0].trim();
  if (!value) return null;

  // Cap length to avoid abuse
  if (value.length > 2048) {
    value = value.slice(0, 2048);
  }

  // Host-only or wildcard host: lowercase
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.includes('/') && !value.includes(' ')) {
    return value.toLowerCase().replace(/\.+$/, '');
  }

  // URL-like: lowercase scheme+host, keep path as-is (minus trailing slash)
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    const u = new URL(withScheme);
    const host = u.hostname.toLowerCase();
    let path = u.pathname || '';
    if (path === '/') path = '';
    else if (path.endsWith('/')) path = path.slice(0, -1);
    const search = u.search || '';
    // Prefer storing without default scheme noise when user pasted host/path only
    if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return `${host}${path}${search}`;
    }
    return `${u.protocol}//${host}${path}${search}`;
  } catch {
    // Fallback: lowercase, strip trailing slash
    return value.replace(/\/+$/, '').toLowerCase();
  }
}

/** Parse a JSON setting value or free-text (one per line / comma-separated) into unique patterns. */
export function parseExceptionPatterns(input: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: string) => {
    const n = normalizeExceptionPattern(raw);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') add(item);
      else if (item && typeof item === 'object' && 'pattern' in item) {
        add(String((item as { pattern: unknown }).pattern ?? ''));
      }
    }
    return out.slice(0, MAX_LINK_CHECK_EXCEPTIONS);
  }

  if (typeof input !== 'string') return out;

  const trimmed = input.trim();
  if (!trimmed) return out;

  // Prefer JSON array when it looks like one
  if (trimmed.startsWith('[')) {
    try {
      const decoded = JSON.parse(trimmed);
      if (Array.isArray(decoded)) {
        return parseExceptionPatterns(decoded);
      }
    } catch {
      // fall through to line/CSV parse
    }
  }

  // Split on newlines, commas, or semicolons
  for (const part of trimmed.split(/[\n\r,;]+/)) {
    add(part);
  }

  return out.slice(0, MAX_LINK_CHECK_EXCEPTIONS);
}

export function parseExceptionsSetting(raw: string | undefined | null): string[] {
  if (!raw || !String(raw).trim()) return [];
  return parseExceptionPatterns(String(raw));
}

export function exceptionsToSettingValue(patterns: string[]): string {
  const unique = parseExceptionPatterns(patterns);
  return unique.length === 0 ? '[]' : JSON.stringify(unique);
}

/**
 * Whether a link URL should be skipped by health checks.
 * Matches: exact URL, host-only, host+path prefix, or simple * wildcards.
 */
export function urlMatchesLinkCheckException(url: string, pattern: string): boolean {
  const u = normalizeExceptionPattern(url);
  const p = normalizeExceptionPattern(pattern);
  if (!u || !p) return false;

  if (u === p) return true;

  // Wildcard glob on the full normalized string
  if (p.includes('*')) {
    const escaped = p
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      if (new RegExp(`^${escaped}$`, 'i').test(u)) return true;
    } catch {
      // ignore bad pattern
    }
  }

  const urlHost = extractHost(u);
  const patternHost = extractHost(p);
  const patternPath = extractPathAndQuery(p);
  const urlPath = extractPathAndQuery(u);

  // Pattern is host-only (or wildcard host)
  if (patternHost && !patternPath) {
    if (patternHost.includes('*')) {
      const escaped = patternHost
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      try {
        if (urlHost && new RegExp(`^${escaped}$`, 'i').test(urlHost)) return true;
      } catch {
        // ignore
      }
    } else if (urlHost && urlHost === patternHost) {
      return true;
    }
  }

  // Host + path prefix
  if (patternHost && patternPath && urlHost === patternHost) {
    if (urlPath === patternPath || urlPath.startsWith(patternPath + '/')) {
      return true;
    }
  }

  // Prefix match on normalized forms (e.g. https://bi.example.com/app)
  if (!p.includes('*') && (u.startsWith(p + '/') || u.startsWith(p + '?'))) {
    return true;
  }

  return false;
}

export function isUrlExcludedFromLinkCheck(url: string, exceptions: string[]): boolean {
  if (!url || exceptions.length === 0) return false;
  return exceptions.some((p) => urlMatchesLinkCheckException(url, p));
}

function extractHost(normalized: string): string {
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(normalized)
      ? normalized
      : `https://${normalized}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return normalized.split('/')[0].toLowerCase();
  }
}

function extractPathAndQuery(normalized: string): string {
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(normalized)
      ? normalized
      : `https://${normalized}`;
    const u = new URL(withScheme);
    let path = u.pathname || '';
    if (path === '/') path = '';
    else if (path.endsWith('/')) path = path.slice(0, -1);
    return `${path}${u.search || ''}`;
  } catch {
    const slash = normalized.indexOf('/');
    return slash >= 0 ? normalized.slice(slash) : '';
  }
}
