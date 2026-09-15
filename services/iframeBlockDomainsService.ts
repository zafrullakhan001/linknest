/**
 * Iframe block domains — hosts that skip in-app mobile preview and show the
 * Device emulation / New tab fallback. Stored as JSON string array in
 * settings key `iframe_block_domains`.
 */

export const IFRAME_BLOCK_DOMAINS_SETTING_KEY = 'iframe_block_domains' as const;
export const MAX_IFRAME_BLOCK_DOMAINS = 500;

/** Normalize a single host/domain entry for storage / comparison. */
export function normalizeIframeBlockDomain(raw: string): string | null {
  let value = String(raw ?? '').trim();
  if (!value) return null;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  if (!value) return null;

  value = value.split('#')[0].trim();
  if (!value) return null;

  if (value.length > 253) {
    value = value.slice(0, 253);
  }

  // Strip scheme / path / port if a URL was pasted
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    if (value.includes('/') || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.includes(':')) {
      const u = new URL(withScheme);
      value = u.hostname;
    }
  } catch {
    // keep raw hostname-like string
  }

  value = value.toLowerCase().replace(/\.+$/, '').replace(/^\.+/, '');
  if (!value) return null;

  // Allow simple wildcards: *.example.com or example.*
  if (value.includes('*')) {
    if (!/^(\*\.)?[a-z0-9.*-]+$/i.test(value)) return null;
    return value;
  }

  // Plain hostname
  if (!/^[a-z0-9.-]+$/i.test(value)) return null;
  if (value.includes('..')) return null;
  return value;
}

/** Parse a JSON setting value or free-text (one per line / comma-separated) into unique domains. */
export function parseIframeBlockDomainPatterns(input: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: string) => {
    const n = normalizeIframeBlockDomain(raw);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') add(item);
      else if (item && typeof item === 'object' && 'pattern' in item) {
        add(String((item as { pattern: unknown }).pattern ?? ''));
      } else if (item && typeof item === 'object' && 'domain' in item) {
        add(String((item as { domain: unknown }).domain ?? ''));
      }
    }
    return out.slice(0, MAX_IFRAME_BLOCK_DOMAINS);
  }

  if (typeof input !== 'string') return out;

  const trimmed = input.trim();
  if (!trimmed) return out;

  if (trimmed.startsWith('[')) {
    try {
      const decoded = JSON.parse(trimmed);
      if (Array.isArray(decoded)) {
        return parseIframeBlockDomainPatterns(decoded);
      }
    } catch {
      // fall through
    }
  }

  for (const part of trimmed.split(/[\n\r,;]+/)) {
    add(part);
  }

  return out.slice(0, MAX_IFRAME_BLOCK_DOMAINS);
}

export function parseIframeBlockDomainsSetting(raw: string | undefined | null): string[] {
  if (!raw || !String(raw).trim()) return [];
  return parseIframeBlockDomainPatterns(String(raw));
}

export function iframeBlockDomainsToSettingValue(domains: string[]): string {
  const unique = parseIframeBlockDomainPatterns(domains);
  return unique.length === 0 ? '[]' : JSON.stringify(unique);
}

/** Whether a hostname matches a stored domain pattern (exact, subdomain, or * wildcard). */
export function hostMatchesIframeBlockDomain(hostname: string, pattern: string): boolean {
  const host = String(hostname || '').toLowerCase().replace(/\.+$/, '');
  const p = normalizeIframeBlockDomain(pattern);
  if (!host || !p) return false;

  if (host === p) return true;

  // Apex match: sharepoint.com matches foo.sharepoint.com
  if (!p.includes('*') && host.endsWith(`.${p}`)) return true;

  if (p.includes('*')) {
    const escaped = p
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    try {
      if (new RegExp(`^${escaped}$`, 'i').test(host)) return true;
    } catch {
      return false;
    }
  }

  return false;
}

export function isHostBlockedByIframeDomains(hostname: string, domains: string[]): boolean {
  if (!hostname || domains.length === 0) return false;
  return domains.some((d) => hostMatchesIframeBlockDomain(hostname, d));
}
