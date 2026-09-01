import type { Link } from '../types';

export type DuplicateLinkGroup = {
  /** Normalized key used for matching */
  key: string;
  /** Display URL from the first link in the group */
  url: string;
  /** First occurrence kept by default */
  keep: Link;
  /** Later occurrences with the same URL */
  duplicates: Link[];
};

/** Normalize a link URL for duplicate matching within a section. */
export function normalizeUrlForDuplicateKey(url: string): string {
  let s = String(url || '').trim();
  if (!s) return '';

  // Collapse whitespace and lowercase for scheme/host comparison
  s = s.replace(/\s+/g, '');

  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      u.hash = '';
      let path = u.pathname || '/';
      if (path.length > 1 && path.endsWith('/')) {
        path = path.slice(0, -1);
      }
      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const port = u.port ? `:${u.port}` : '';
      const search = u.search || '';
      return `${u.protocol}//${host}${port}${path}${search}`;
    }
  } catch {
    // fall through
  }

  return s.toLowerCase();
}

/**
 * Find duplicate link groups in a section (same normalized URL).
 * Links are considered in array order; the first of each key is the keep candidate.
 */
export function findDuplicateLinkGroups(links: Link[]): DuplicateLinkGroup[] {
  const order: string[] = [];
  const map = new Map<string, Link[]>();

  for (const link of links || []) {
    const key = normalizeUrlForDuplicateKey(link.url || '');
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(link);
  }

  const groups: DuplicateLinkGroup[] = [];
  for (const key of order) {
    const list = map.get(key)!;
    if (list.length < 2) continue;
    groups.push({
      key,
      url: list[0].url || key,
      keep: list[0],
      duplicates: list.slice(1),
    });
  }
  return groups;
}

export function countRemovableDuplicates(groups: DuplicateLinkGroup[]): number {
  return groups.reduce((n, g) => n + g.duplicates.length, 0);
}

/** Strip simple HTML tags for dialog display. */
export function plainLinkLabel(label: string): string {
  return String(label || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}
