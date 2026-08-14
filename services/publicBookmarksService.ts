import { getAppBasePath, getAppStorageScope } from './apiHelpers';
import { generateUuid } from './idService';
import {
  parseHTMLBookmarks,
  deduplicateBookmarks,
  groupBookmarksByDomain,
  normalizeBookmarkUrl,
  getBookmarkBaseDomain
} from './bookmarkImportService';
import type { Tile, ThemeColor } from '../types';
import { THEME_COLORS } from '../types';
import type { SpaceExportFile } from './spaceTransferService';

/**
 * Guest "Your Bookmarks" — Chrome HTML import stored in scoped localStorage.
 * Separate from public favorites star lists and from Fav Organizer (auth/server tiles).
 */

const BOOKMARKS_KEY = 'linknest_public_bookmarks';
const SUBTAB_KEY = 'linknest_public_favorites_subtab';

export type PublicFavoritesSubTab = 'favorites' | 'bookmarks';

export const OPEN_ALL_BOOKMARKS_MAX = 10;

export interface PublicBookmarkLink {
  id: string;
  title: string;
  url: string;
  pinned?: boolean;
  lastOpenedAt?: string;
  /** Last health probe status from check-url (guest bookmarks). */
  healthStatus?: string;
  healthHttpCode?: number | null;
  healthError?: string | null;
  healthCheckedAt?: string;
  /** Final URL after redirects from last health check (when different from url). */
  healthFinalUrl?: string;
}

export interface PublicBookmarkCategory {
  id: string;
  title: string;
  emoji?: string;
  themeColor?: string;
  pinned?: boolean;
  lastOpenedAt?: string;
  links: PublicBookmarkLink[];
}

export interface PublicBookmarksData {
  categories: PublicBookmarkCategory[];
  updatedAt: string;
}

export interface PublicBookmarkDupeGroup {
  normalizedUrl: string;
  url: string;
  entries: Array<{ categoryId: string; categoryTitle: string; link: PublicBookmarkLink }>;
}

const emptyBookmarks = (): PublicBookmarksData => ({
  categories: [],
  updatedAt: new Date().toISOString()
});

const getInstanceScope = (): string => getAppStorageScope() || '__root__';

const storageKey = (baseKey: string): string => {
  const scope = getInstanceScope();
  return `${baseKey}:${scope || '__root__'}`;
};

const isLocalStorageAvailable = (): boolean => {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
};

const removeThisInstanceKey = (baseKey: string): void => {
  const currentScope = getInstanceScope().toLowerCase();
  const path = (getAppBasePath() || '').toLowerCase();
  const prefix = `${baseKey}:`;
  const toRemove: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length).toLowerCase();
      if (rest === currentScope || (path && rest === path)) {
        toRemove.push(key);
      }
    }
    if (toRemove.length === 0) {
      toRemove.push(storageKey(baseKey));
    }
    toRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    try {
      localStorage.removeItem(storageKey(baseKey));
    } catch {
      // ignore
    }
  }
};

const normalizeLink = (raw: unknown): PublicBookmarkLink | null => {
  if (!raw || typeof raw !== 'object') return null;
  const link = raw as Record<string, unknown>;
  const url = typeof link.url === 'string' ? link.url.trim() : '';
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return null;
  return {
    id:
      typeof link.id === 'string' && link.id.trim()
        ? link.id.trim()
        : generateUuid(),
    title:
      (typeof link.title === 'string' && link.title.trim()) ||
      (typeof link.label === 'string' && link.label.trim()) ||
      url,
    url,
    pinned: link.pinned === true,
    lastOpenedAt:
      typeof link.lastOpenedAt === 'string' && link.lastOpenedAt.trim()
        ? link.lastOpenedAt.trim()
        : undefined,
    healthStatus:
      typeof link.healthStatus === 'string' && link.healthStatus.trim()
        ? link.healthStatus.trim()
        : undefined,
    healthHttpCode:
      typeof link.healthHttpCode === 'number' ? link.healthHttpCode : null,
    healthError:
      typeof link.healthError === 'string' ? link.healthError : undefined,
    healthCheckedAt:
      typeof link.healthCheckedAt === 'string' && link.healthCheckedAt.trim()
        ? link.healthCheckedAt.trim()
        : undefined,
    healthFinalUrl:
      typeof link.healthFinalUrl === 'string' && link.healthFinalUrl.trim()
        ? link.healthFinalUrl.trim()
        : undefined
  };
};

const normalizeCategory = (raw: unknown): PublicBookmarkCategory | null => {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) return null;

  const linksRaw = Array.isArray(obj.links) ? obj.links : [];
  const links: PublicBookmarkLink[] = [];
  const seen = new Set<string>();

  for (const entry of linksRaw) {
    const link = normalizeLink(entry);
    if (!link || seen.has(link.id)) continue;
    seen.add(link.id);
    links.push(link);
  }

  return {
    id:
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim()
        : generateUuid(),
    title,
    emoji: typeof obj.emoji === 'string' ? obj.emoji : undefined,
    themeColor: typeof obj.themeColor === 'string' ? obj.themeColor : undefined,
    pinned: obj.pinned === true,
    lastOpenedAt:
      typeof obj.lastOpenedAt === 'string' && obj.lastOpenedAt.trim()
        ? obj.lastOpenedAt.trim()
        : undefined,
    links
  };
};

const persist = (categories: PublicBookmarkCategory[]): PublicBookmarksData => {
  const next: PublicBookmarksData = {
    categories,
    updatedAt: new Date().toISOString()
  };
  setPublicBookmarks(next);
  return next;
};

/** Favicon URL for a bookmark/page (Google favicon service). */
export const getBookmarkFaviconUrl = (url: string, size = 64): string => {
  try {
    const host = new URL(url).hostname;
    if (!host) return '';
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
  } catch {
    return '';
  }
};

export const getCategoryFaviconUrl = (cat: PublicBookmarkCategory, size = 64): string => {
  const first = cat.links[0]?.url;
  return first ? getBookmarkFaviconUrl(first, size) : '';
};

export type BookmarkSortMode =
  | 'manual'
  | 'recent'
  | 'alpha-asc'
  | 'alpha-desc'
  | 'links-max'
  | 'links-min'
  | 'broken-first';

/** Broken or timed-out after a health check (used for sort + remove). */
export const isRemovableBrokenBookmarkHealth = (status?: string): boolean =>
  status === 'broken' || status === 'timeout';

const partitionPinned = <T extends { pinned?: boolean }>(items: T[]): [T[], T[]] => [
  items.filter((i) => i.pinned),
  items.filter((i) => !i.pinned)
];

const sortWithin = <T,>(items: T[], compare: (a: T, b: T) => number): T[] =>
  [...items].sort(compare);

/** Pin first, then apply sort mode within pinned / unpinned groups. */
export const sortBookmarkCategories = (
  categories: PublicBookmarkCategory[],
  mode: BookmarkSortMode = 'manual'
): PublicBookmarkCategory[] => {
  const [pinned, rest] = partitionPinned(categories);
  if (mode === 'manual' || mode === 'broken-first') return [...pinned, ...rest];

  const compare = (a: PublicBookmarkCategory, b: PublicBookmarkCategory): number => {
    switch (mode) {
      case 'recent': {
        const at = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
        const bt = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
        return bt - at;
      }
      case 'alpha-asc':
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      case 'alpha-desc':
        return b.title.localeCompare(a.title, undefined, { sensitivity: 'base' });
      case 'links-max':
        return b.links.length - a.links.length || a.title.localeCompare(b.title);
      case 'links-min':
        return a.links.length - b.links.length || a.title.localeCompare(b.title);
      default:
        return 0;
    }
  };

  return [...sortWithin(pinned, compare), ...sortWithin(rest, compare)];
};

export const sortBookmarkLinks = (
  links: PublicBookmarkLink[],
  mode: BookmarkSortMode = 'manual'
): PublicBookmarkLink[] => {
  // Broken/timeout first (then pinned within each group)
  if (mode === 'broken-first') {
    const broken = links.filter((l) => isRemovableBrokenBookmarkHealth(l.healthStatus));
    const ok = links.filter((l) => !isRemovableBrokenBookmarkHealth(l.healthStatus));
    const orderPinned = (list: PublicBookmarkLink[]) => {
      const [pinned, rest] = partitionPinned(list);
      return [...pinned, ...rest];
    };
    return [...orderPinned(broken), ...orderPinned(ok)];
  }

  const [pinned, rest] = partitionPinned(links);
  // Link-count modes don't apply inside a space — fall back to manual order.
  if (mode === 'manual' || mode === 'links-max' || mode === 'links-min') {
    return [...pinned, ...rest];
  }

  const compare = (a: PublicBookmarkLink, b: PublicBookmarkLink): number => {
    switch (mode) {
      case 'recent': {
        const at = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0;
        const bt = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0;
        return bt - at;
      }
      case 'alpha-asc':
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      case 'alpha-desc':
        return b.title.localeCompare(a.title, undefined, { sensitivity: 'base' });
      default:
        return 0;
    }
  };

  return [...sortWithin(pinned, compare), ...sortWithin(rest, compare)];
};

export const getPublicBookmarks = (): PublicBookmarksData => {
  if (!isLocalStorageAvailable()) return emptyBookmarks();
  try {
    const stored = localStorage.getItem(storageKey(BOOKMARKS_KEY));
    if (!stored) return emptyBookmarks();
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return emptyBookmarks();
    const categoriesRaw = Array.isArray(parsed.categories) ? parsed.categories : [];
    const categories = categoriesRaw
      .map(normalizeCategory)
      .filter(Boolean) as PublicBookmarkCategory[];
    return {
      categories,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date().toISOString()
    };
  } catch (error) {
    console.error('Failed to get public bookmarks:', error);
    return emptyBookmarks();
  }
};

export const setPublicBookmarks = (data: PublicBookmarksData): boolean => {
  if (!isLocalStorageAvailable()) return false;
  try {
    const categories = (data.categories || [])
      .map(normalizeCategory)
      .filter(Boolean) as PublicBookmarkCategory[];
    const payload: PublicBookmarksData = {
      categories,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(storageKey(BOOKMARKS_KEY), JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Failed to save public bookmarks:', error);
    return false;
  }
};

export const clearPublicBookmarks = (): void => {
  try {
    removeThisInstanceKey(BOOKMARKS_KEY);
  } catch (error) {
    console.error('Failed to clear public bookmarks:', error);
  }
};

export const countPublicBookmarkLinks = (data?: PublicBookmarksData): number => {
  const source = data ?? getPublicBookmarks();
  return source.categories.reduce((sum, cat) => sum + cat.links.length, 0);
};

/** Build domain-grouped categories from a flat bookmark list. */
export const buildPublicBookmarkCategoriesFromList = (
  bookmarks: Array<{ title: string; url: string }>
): PublicBookmarkCategory[] => {
  return groupBookmarksByDomain(bookmarks).map((group) => ({
    id: generateUuid(),
    title: group.title,
    emoji: group.emoji,
    themeColor: group.themeColor,
    links: group.links.map((link) => ({
      id: generateUuid(),
      title: link.title,
      url: link.url
    }))
  }));
};

const findCategoryForDomain = (
  categories: PublicBookmarkCategory[],
  domainKey: string
): PublicBookmarkCategory | undefined => {
  const titleGuess =
    domainKey === 'misc'
      ? 'Miscellaneous'
      : domainKey.charAt(0).toUpperCase() + domainKey.slice(1);
  return categories.find((cat) => {
    if (cat.title.toLowerCase() === titleGuess.toLowerCase()) return true;
    if (cat.title.toLowerCase() === domainKey.toLowerCase()) return true;
    return cat.links.some((l) => getBookmarkBaseDomain(l.url) === domainKey);
  });
};

type ImportResult = {
  success: boolean;
  message: string;
  linkCount: number;
  categoryCount: number;
  duplicateCount: number;
  addedCount?: number;
  skippedExisting?: number;
};

/**
 * Import Chrome/Netscape HTML bookmarks, replace current guest bookmarks store.
 */
export const importPublicBookmarksFromHtml = async (
  file: File
): Promise<ImportResult> => {
  if (!isLocalStorageAvailable()) {
    return {
      success: false,
      message: 'Browser storage is not available. Cannot save bookmarks here.',
      linkCount: 0,
      categoryCount: 0,
      duplicateCount: 0
    };
  }

  try {
    const text = await file.text();
    const extracted = parseHTMLBookmarks(text);
    const { unique, duplicateCount } = deduplicateBookmarks(extracted);

    if (unique.length === 0) {
      return {
        success: false,
        message:
          'No bookmarks found in this file. Export bookmarks from Chrome (HTML) and try again.',
        linkCount: 0,
        categoryCount: 0,
        duplicateCount
      };
    }

    const categories = buildPublicBookmarkCategoriesFromList(unique);
    setPublicBookmarks({ categories, updatedAt: new Date().toISOString() });

    const dupNote =
      duplicateCount > 0 ? ` (${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped)` : '';

    return {
      success: true,
      message: `Imported ${unique.length} link${unique.length === 1 ? '' : 's'} in ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}${dupNote}.`,
      linkCount: unique.length,
      categoryCount: categories.length,
      duplicateCount
    };
  } catch (error) {
    console.error('Failed to import public bookmarks:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to import bookmark HTML file.',
      linkCount: 0,
      categoryCount: 0,
      duplicateCount: 0
    };
  }
};

/**
 * Merge HTML bookmarks into existing spaces (dedupe by URL). Preserves pins/renames.
 */
export const mergePublicBookmarksFromHtml = async (
  file: File
): Promise<ImportResult> => {
  if (!isLocalStorageAvailable()) {
    return {
      success: false,
      message: 'Browser storage is not available. Cannot save bookmarks here.',
      linkCount: 0,
      categoryCount: 0,
      duplicateCount: 0,
      addedCount: 0,
      skippedExisting: 0
    };
  }

  try {
    const text = await file.text();
    const extracted = parseHTMLBookmarks(text);
    const { unique, duplicateCount } = deduplicateBookmarks(extracted);

    if (unique.length === 0) {
      return {
        success: false,
        message: 'No bookmarks found in this file.',
        linkCount: 0,
        categoryCount: 0,
        duplicateCount,
        addedCount: 0,
        skippedExisting: 0
      };
    }

    const current = getPublicBookmarks();
    const existingUrls = new Set(
      current.categories.flatMap((c) =>
        c.links.map((l) => normalizeBookmarkUrl(l.url))
      )
    );

    const toAdd = unique.filter(
      (b) => !existingUrls.has(normalizeBookmarkUrl(b.url))
    );
    const skippedExisting = unique.length - toAdd.length;

    if (toAdd.length === 0) {
      return {
        success: true,
        message: `No new links to add (${skippedExisting} already saved${duplicateCount > 0 ? `, ${duplicateCount} in-file duplicates skipped` : ''}).`,
        linkCount: countPublicBookmarkLinks(current),
        categoryCount: current.categories.length,
        duplicateCount,
        addedCount: 0,
        skippedExisting
      };
    }

    const groups = groupBookmarksByDomain(toAdd);
    let categories = current.categories.map((c) => ({
      ...c,
      links: [...c.links]
    }));

    for (const group of groups) {
      const existing = findCategoryForDomain(categories, group.domainKey);
      const newLinks = group.links.map((link) => ({
        id: generateUuid(),
        title: link.title,
        url: link.url
      }));
      if (existing) {
        categories = categories.map((cat) =>
          cat.id === existing.id
            ? { ...cat, links: [...cat.links, ...newLinks] }
            : cat
        );
      } else {
        categories.push({
          id: generateUuid(),
          title: group.title,
          emoji: group.emoji,
          themeColor: group.themeColor,
          links: newLinks
        });
      }
    }

    const next = persist(categories);
    return {
      success: true,
      message: `Merged ${toAdd.length} new link${toAdd.length === 1 ? '' : 's'} (${skippedExisting} already present${duplicateCount > 0 ? `, ${duplicateCount} in-file duplicates skipped` : ''}).`,
      linkCount: countPublicBookmarkLinks(next),
      categoryCount: next.categories.length,
      duplicateCount,
      addedCount: toAdd.length,
      skippedExisting
    };
  } catch (error) {
    console.error('Failed to merge public bookmarks:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to merge bookmark HTML file.',
      linkCount: 0,
      categoryCount: 0,
      duplicateCount: 0,
      addedCount: 0,
      skippedExisting: 0
    };
  }
};

/** Re-run domain grouping from all current links (replaces categories). */
export const regeneratePublicBookmarksByDomain = (): PublicBookmarksData => {
  const current = getPublicBookmarks();
  const flat = current.categories.flatMap((cat) =>
    cat.links.map((link) => ({ title: link.title, url: link.url }))
  );
  const categories = buildPublicBookmarkCategoriesFromList(flat);
  return persist(categories);
};

export const swapPublicBookmarkCategories = (
  categoryIdA: string,
  categoryIdB: string
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const categories = [...data.categories];
  const i = categories.findIndex((c) => c.id === categoryIdA);
  const j = categories.findIndex((c) => c.id === categoryIdB);
  if (i === -1 || j === -1 || i === j) return data;
  [categories[i], categories[j]] = [categories[j], categories[i]];
  return persist(categories);
};

export const movePublicBookmarkCategory = (
  categoryId: string,
  direction: 'up' | 'down'
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const i = data.categories.findIndex((c) => c.id === categoryId);
  if (i === -1) return data;
  const j = direction === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= data.categories.length) return data;
  return swapPublicBookmarkCategories(data.categories[i].id, data.categories[j].id);
};

export const swapPublicBookmarkLinks = (
  categoryId: string,
  linkIdA: string,
  linkIdB: string
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat;
    const links = [...cat.links];
    const i = links.findIndex((l) => l.id === linkIdA);
    const j = links.findIndex((l) => l.id === linkIdB);
    if (i === -1 || j === -1 || i === j) return cat;
    [links[i], links[j]] = [links[j], links[i]];
    return { ...cat, links };
  });
  return persist(categories);
};

export const movePublicBookmarkLink = (
  categoryId: string,
  linkId: string,
  direction: 'left' | 'right'
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const cat = data.categories.find((c) => c.id === categoryId);
  if (!cat) return data;
  const i = cat.links.findIndex((l) => l.id === linkId);
  if (i === -1) return data;
  const j = direction === 'left' ? i - 1 : i + 1;
  if (j < 0 || j >= cat.links.length) return data;
  return swapPublicBookmarkLinks(categoryId, cat.links[i].id, cat.links[j].id);
};

export const removePublicBookmarkLink = (
  categoryId: string,
  linkId: string
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const categories = data.categories
    .map((cat) => {
      if (cat.id !== categoryId) return cat;
      return { ...cat, links: cat.links.filter((l) => l.id !== linkId) };
    })
    .filter((cat) => cat.links.length > 0);
  return persist(categories);
};

/** Delete an entire bookmark space (category) and its links. */
export const removePublicBookmarkCategory = (
  categoryId: string
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const categories = data.categories.filter((cat) => cat.id !== categoryId);
  return persist(categories);
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Build a Netscape/Chrome bookmark HTML file from current guest bookmarks.
 * Folders mirror domain spaces so Chrome can import them back.
 */
export const buildPublicBookmarksHtml = (
  data?: PublicBookmarksData,
  onlyCategoryId?: string
): string => {
  const source = data ?? getPublicBookmarks();
  const cats = onlyCategoryId
    ? source.categories.filter((c) => c.id === onlyCategoryId)
    : source.categories;
  const now = Math.floor(Date.now() / 1000);
  const folders = cats
    .map((cat) => {
      const items = cat.links
        .map(
          (link) =>
            `            <DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${now}">${escapeHtml(link.title)}</A>`
        )
        .join('\n');
      return `        <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}">${escapeHtml(cat.title)}</H3>
        <DL><p>
${items}
        </DL><p>`;
    })
    .join('\n');

  const rootTitle = onlyCategoryId
    ? cats[0]?.title || 'LinkNest Space'
    : 'LinkNest Your Bookmarks';

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}">${escapeHtml(rootTitle)}</H3>
    <DL><p>
${folders}
    </DL><p>
</DL><p>
`;
};

const triggerHtmlDownload = (html: string, filename: string): void => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** Download Chrome-compatible bookmark HTML for re-import into the browser. */
export const downloadPublicBookmarksHtml = (
  data?: PublicBookmarksData
): { success: boolean; message: string; linkCount: number } => {
  const source = data ?? getPublicBookmarks();
  const total = countPublicBookmarkLinks(source);
  if (total === 0) {
    return {
      success: false,
      message: 'No bookmarks to export.',
      linkCount: 0
    };
  }

  try {
    const html = buildPublicBookmarksHtml(source);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerHtmlDownload(html, `linknest-bookmarks-${stamp}.html`);
    return {
      success: true,
      message: `Exported ${total} link${total === 1 ? '' : 's'} in ${source.categories.length} folder${source.categories.length === 1 ? '' : 's'}. Import this HTML in Chrome: Bookmarks → Bookmark manager → ⋮ → Import bookmarks.`,
      linkCount: total
    };
  } catch (error) {
    console.error('Failed to export public bookmarks:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to export bookmark HTML file.',
      linkCount: total
    };
  }
};

/** Export a single space as Chrome-compatible HTML. */
export const downloadPublicBookmarkCategoryHtml = (
  categoryId: string,
  data?: PublicBookmarksData
): { success: boolean; message: string; linkCount: number } => {
  const source = data ?? getPublicBookmarks();
  const cat = source.categories.find((c) => c.id === categoryId);
  if (!cat || cat.links.length === 0) {
    return {
      success: false,
      message: 'Nothing to export in this space.',
      linkCount: 0
    };
  }

  try {
    const html = buildPublicBookmarksHtml(source, categoryId);
    const safe = cat.title.replace(/[^\w\-]+/g, '_').slice(0, 40) || 'space';
    const stamp = new Date().toISOString().slice(0, 10);
    triggerHtmlDownload(html, `linknest-${safe}-${stamp}.html`);
    return {
      success: true,
      message: `Exported “${cat.title}” (${cat.links.length} link${cat.links.length === 1 ? '' : 's'}). Import in Chrome via Bookmark manager → Import bookmarks.`,
      linkCount: cat.links.length
    };
  } catch (error) {
    console.error('Failed to export bookmark space:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to export this space.',
      linkCount: cat.links.length
    };
  }
};

/** Normalize user domain input (strip protocol/path; keep host only). */
export const normalizeDomainInput = (raw: string): string => {
  let s = raw.trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '');
  s = s.split('/')[0].split('?')[0].split('#')[0];
  s = s.replace(/:\d+$/, '');
  s = s.replace(/^\.+|\.+$/g, '');
  return s;
};

/**
 * Rewrite hostname when it equals or is a subdomain of fromDomain.
 * e.g. www.ahss.org + ahss.org → www.adventhealth.com
 */
export const rewriteBookmarkUrlDomain = (
  url: string,
  fromDomain: string,
  toDomain: string
): string | null => {
  const from = normalizeDomainInput(fromDomain);
  const to = normalizeDomainInput(toDomain);
  if (!from || !to || from === to) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === from) {
      parsed.hostname = to;
      return parsed.toString();
    }
    if (host.endsWith(`.${from}`)) {
      parsed.hostname = `${host.slice(0, -(from.length + 1))}.${to}`;
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
};

const titleLooksLikeDomain = (title: string, domain: string): boolean => {
  const t = title.trim().toLowerCase();
  const d = domain.toLowerCase();
  if (!t || !d) return false;
  if (t === d || t === `www.${d}`) return true;
  // Domain-style titles from grouping (e.g. "Ahss.org" → Ahss)
  const base = d.split('.')[0];
  return !!base && t === base;
};

export interface BookmarkRewriteChange {
  categoryId: string;
  categoryTitle: string;
  linkId?: string;
  linkTitle?: string;
  field: 'url' | 'title' | 'spaceTitle' | 'space';
  before: string;
  after: string;
}

export interface BookmarkRewriteResult {
  data: PublicBookmarksData;
  ok: boolean;
  message: string;
  scanned: number;
  updated: number;
  changes: BookmarkRewriteChange[];
}

export type BookmarkRewriteScope = {
  categoryId?: string;
  dryRun?: boolean;
  renameMatchingSpaces?: boolean;
  /** Skip pinned links. */
  skipPinned?: boolean;
  /** When set, only these link IDs are rewritten. */
  linkIds?: string[];
  /** Use this dataset instead of reading storage (pipelines). */
  sourceData?: PublicBookmarksData;
  /** Mutate in memory without writing storage (pipelines). */
  deferPersist?: boolean;
};

const linkMatchesRewriteScope = (
  link: PublicBookmarkLink,
  opts?: BookmarkRewriteScope
): boolean => {
  if (opts?.skipPinned && link.pinned) return false;
  if (opts?.linkIds && opts.linkIds.length > 0 && !opts.linkIds.includes(link.id)) {
    return false;
  }
  return true;
};

const resolveRewriteSource = (opts?: BookmarkRewriteScope): PublicBookmarksData =>
  opts?.sourceData ?? getPublicBookmarks();

const TRACKING_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  '_ga',
  '_gl',
  '_hsenc',
  '_hsmi',
  'igshid',
  'si',
  'feature',
  'ref',
  'ref_src',
  'ref_url',
  'ncid',
  'cmpid',
  's_cid'
]);

const isTrackingQueryKey = (key: string): boolean => {
  const k = key.toLowerCase();
  if (TRACKING_QUERY_KEYS.has(k)) return true;
  if (k.startsWith('utm_')) return true;
  if (k.startsWith('hsa_')) return true;
  if (k.startsWith('mtm_')) return true;
  if (k.startsWith('pk_')) return true;
  return false;
};

/** Strip common marketing / click-id query params. */
export const stripBookmarkTrackingParams = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    let changed = false;
    const keys = [...parsed.searchParams.keys()];
    for (const key of keys) {
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
};

/** Upgrade http:// → https:// when possible. */
export const forceBookmarkUrlHttps = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:') return null;
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return null;
  }
};

/** Normalize path prefix for rewrite (leading slash, no trailing slash except root). */
export const normalizePathPrefix = (raw: string): string => {
  let s = raw.trim();
  if (!s) return '';
  if (!s.startsWith('/')) s = `/${s}`;
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
};

/**
 * Replace a path prefix: /oldportal/foo → /new/foo when from=/oldportal to=/new
 */
export const rewriteBookmarkUrlPath = (
  url: string,
  fromPathRaw: string,
  toPathRaw: string
): string | null => {
  const fromPath = normalizePathPrefix(fromPathRaw);
  const toPath = normalizePathPrefix(toPathRaw);
  if (!fromPath || toPath === '') return null;
  if (fromPath === toPath) return null;

  try {
    const parsed = new URL(url);
    const path = parsed.pathname || '/';
    if (path === fromPath || path.startsWith(`${fromPath}/`)) {
      const rest = path.slice(fromPath.length);
      parsed.pathname = `${toPath}${rest}` || '/';
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
};

const dedupeCategoryLinks = (links: PublicBookmarkLink[]): PublicBookmarkLink[] => {
  const seen = new Set<string>();
  const deduped: PublicBookmarkLink[] = [];
  for (const link of links) {
    const key = normalizeBookmarkUrl(link.url);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(link);
  }
  return deduped;
};

const emptyRewriteResult = (
  message: string,
  ok = false
): BookmarkRewriteResult => ({
  data: getPublicBookmarks(),
  ok,
  message,
  scanned: 0,
  updated: 0,
  changes: []
});

const REWRITE_UNDO_KEY = 'undo';
const REWRITE_RECIPES_KEY = 'rewrite_recipes';

const rewriteMetaStorageKey = (suffix: string): string =>
  storageKey(`bookmarks_${suffix}`);

/** Save pre-rewrite snapshot for one-shot Undo. */
export const pushBookmarkRewriteUndoSnapshot = (
  data?: PublicBookmarksData
): void => {
  try {
    const snapshot = data ?? getPublicBookmarks();
    localStorage.setItem(
      rewriteMetaStorageKey(REWRITE_UNDO_KEY),
      JSON.stringify({
        savedAt: new Date().toISOString(),
        data: snapshot
      })
    );
  } catch {
    // ignore quota
  }
};

export const peekBookmarkRewriteUndo = (): {
  savedAt: string;
  linkCount: number;
  spaceCount: number;
} | null => {
  try {
    const raw = localStorage.getItem(rewriteMetaStorageKey(REWRITE_UNDO_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      savedAt?: string;
      data?: PublicBookmarksData;
    };
    if (!parsed?.data?.categories || !Array.isArray(parsed.data.categories)) return null;
    return {
      savedAt: parsed.savedAt || '',
      spaceCount: parsed.data.categories.length,
      linkCount: countPublicBookmarkLinks(parsed.data)
    };
  } catch {
    return null;
  }
};

export const clearBookmarkRewriteUndo = (): void => {
  try {
    localStorage.removeItem(rewriteMetaStorageKey(REWRITE_UNDO_KEY));
  } catch {
    // ignore
  }
};

/** Restore the last rewrite undo snapshot (clears undo after success). */
export const undoLastPublicBookmarkRewrite = (): BookmarkRewriteResult => {
  try {
    const raw = localStorage.getItem(rewriteMetaStorageKey(REWRITE_UNDO_KEY));
    if (!raw) {
      return emptyRewriteResult('Nothing to undo — no rewrite snapshot saved.', true);
    }
    const parsed = JSON.parse(raw) as { data?: PublicBookmarksData };
    if (!parsed?.data?.categories || !Array.isArray(parsed.data.categories)) {
      clearBookmarkRewriteUndo();
      return emptyRewriteResult('Undo snapshot was invalid.', false);
    }
    const restored = persist(parsed.data.categories);
    clearBookmarkRewriteUndo();
    const n = countPublicBookmarkLinks(restored);
    return {
      data: restored,
      ok: true,
      message: `Undid last rewrite — restored ${restored.categories.length} space(s), ${n} link(s).`,
      scanned: n,
      updated: n,
      changes: []
    };
  } catch {
    return emptyRewriteResult('Failed to undo rewrite.', false);
  }
};

const finishRewrite = (
  source: PublicBookmarksData,
  categories: PublicBookmarkCategory[],
  changes: BookmarkRewriteChange[],
  scanned: number,
  opts: BookmarkRewriteScope | undefined,
  successMessage: string,
  noneMessage: string
): BookmarkRewriteResult => {
  const updated = new Set(
    changes
      .filter((c) => c.linkId)
      .map((c) => `${c.categoryId}:${c.linkId}`)
  ).size;
  const spaceOnly = changes.filter((c) => c.field === 'spaceTitle' && !c.linkId).length;
  const linkUpdates = updated;
  const totalTouched = linkUpdates + spaceOnly;

  if (changes.length === 0) {
    return {
      data: source,
      ok: true,
      message: noneMessage,
      scanned,
      updated: 0,
      changes: []
    };
  }

  if (opts?.dryRun) {
    return {
      data: source,
      ok: true,
      message: `Preview: ${changes.length} change${changes.length === 1 ? '' : 's'} across ${Math.max(linkUpdates, 1)} link/space update${linkUpdates === 1 && spaceOnly === 0 ? '' : 's'} (${scanned} scanned).`,
      scanned,
      updated: linkUpdates || totalTouched,
      changes
    };
  }

  const nextData: PublicBookmarksData = {
    categories,
    updatedAt: new Date().toISOString()
  };

  if (opts?.deferPersist) {
    return {
      data: nextData,
      ok: true,
      message: successMessage.replace('%n%', String(linkUpdates || changes.length)),
      scanned,
      updated: linkUpdates || changes.length,
      changes
    };
  }

  pushBookmarkRewriteUndoSnapshot(source);
  const next = persist(categories);
  return {
    data: next,
    ok: true,
    message: successMessage.replace('%n%', String(linkUpdates || changes.length)),
    scanned,
    updated: linkUpdates || changes.length,
    changes
  };
};

/**
 * Rewrite bookmark URLs from one domain to another (branding migrations).
 * Scope: one space (categoryId) or all spaces. Pass dryRun for staging preview.
 */
export const rewritePublicBookmarkDomains = (
  fromDomainRaw: string,
  toDomainRaw: string,
  opts?: BookmarkRewriteScope
): BookmarkRewriteResult => {
  const from = normalizeDomainInput(fromDomainRaw);
  const to = normalizeDomainInput(toDomainRaw);

  if (!from || !to) {
    return emptyRewriteResult(
      'Enter both the old domain and the new domain (e.g. ahss.org → adventhealth.com).'
    );
  }
  if (from === to) {
    return emptyRewriteResult('Old and new domains are the same.');
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(from) || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(to)) {
    return emptyRewriteResult(
      'Use a valid domain like ahss.org or adventhealth.com (no path).'
    );
  }

  const source = resolveRewriteSource(opts);
  let scanned = 0;
  const changes: BookmarkRewriteChange[] = [];
  const renameSpaces = opts?.renameMatchingSpaces !== false;
  const toTitle = to.charAt(0).toUpperCase() + to.slice(1);

  const categories = source.categories.map((cat) => {
    if (opts?.categoryId && cat.id !== opts.categoryId) return cat;

    const links = cat.links.map((link) => {
      if (!linkMatchesRewriteScope(link, opts)) return link;
      scanned += 1;
      const nextUrl = rewriteBookmarkUrlDomain(link.url, from, to);
      if (!nextUrl || nextUrl === link.url) return link;

      let title = link.title;
      if (title === link.url) title = nextUrl;

      changes.push({
        categoryId: cat.id,
        categoryTitle: cat.title,
        linkId: link.id,
        linkTitle: link.title,
        field: 'url',
        before: link.url,
        after: nextUrl
      });
      if (title !== link.title) {
        changes.push({
          categoryId: cat.id,
          categoryTitle: cat.title,
          linkId: link.id,
          linkTitle: link.title,
          field: 'title',
          before: link.title,
          after: title
        });
      }
      return { ...link, url: nextUrl, title, healthFinalUrl: undefined };
    });

    const deduped = dedupeCategoryLinks(links);
    let title = cat.title;
    if (renameSpaces && titleLooksLikeDomain(cat.title, from)) {
      changes.push({
        categoryId: cat.id,
        categoryTitle: cat.title,
        field: 'spaceTitle',
        before: cat.title,
        after: toTitle
      });
      title = toTitle;
    }

    return { ...cat, title, links: deduped };
  });

  return finishRewrite(
    source,
    categories,
    changes,
    scanned,
    opts,
    `Rewrote %n% link(s) from ${from} → ${to}${opts?.categoryId ? ' in this space' : ' across Your Bookmarks'}.`,
    `No links matched “${from}”${opts?.categoryId ? ' in this space' : ''}.`
  );
};

/**
 * Path prefix rewrite: /oldportal → /new (keeps host, query, hash).
 */
export const rewritePublicBookmarkPaths = (
  fromPathRaw: string,
  toPathRaw: string,
  opts?: BookmarkRewriteScope
): BookmarkRewriteResult => {
  const fromPath = normalizePathPrefix(fromPathRaw);
  const toPath = normalizePathPrefix(toPathRaw);

  if (!fromPath) {
    return emptyRewriteResult('Enter the old path prefix (e.g. /oldportal).');
  }
  if (toPath === '') {
    return emptyRewriteResult('Enter the new path prefix (e.g. /new or /).');
  }
  if (fromPath === toPath) {
    return emptyRewriteResult('Old and new paths are the same.');
  }

  const source = resolveRewriteSource(opts);
  let scanned = 0;
  const changes: BookmarkRewriteChange[] = [];

  const categories = source.categories.map((cat) => {
    if (opts?.categoryId && cat.id !== opts.categoryId) return cat;

    const links = cat.links.map((link) => {
      if (!linkMatchesRewriteScope(link, opts)) return link;
      scanned += 1;
      const nextUrl = rewriteBookmarkUrlPath(link.url, fromPath, toPath);
      if (!nextUrl || nextUrl === link.url) return link;

      let title = link.title;
      if (title === link.url) title = nextUrl;

      changes.push({
        categoryId: cat.id,
        categoryTitle: cat.title,
        linkId: link.id,
        linkTitle: link.title,
        field: 'url',
        before: link.url,
        after: nextUrl
      });
      return { ...link, url: nextUrl, title, healthFinalUrl: undefined };
    });

    return { ...cat, links: dedupeCategoryLinks(links) };
  });

  return finishRewrite(
    source,
    categories,
    changes,
    scanned,
    opts,
    `Rewrote path on %n% link(s): ${fromPath} → ${toPath}.`,
    `No links matched path “${fromPath}”${opts?.categoryId ? ' in this space' : ''}.`
  );
};

/**
 * Strip tracking params and/or force HTTPS.
 */
export const cleanupPublicBookmarkUrls = (
  opts: BookmarkRewriteScope & {
    stripTracking?: boolean;
    forceHttps?: boolean;
  }
): BookmarkRewriteResult => {
  const stripTracking = opts.stripTracking !== false;
  const forceHttps = opts.forceHttps === true;
  if (!stripTracking && !forceHttps) {
    return emptyRewriteResult('Enable strip tracking params and/or force HTTPS.');
  }

  const source = resolveRewriteSource(opts);
  let scanned = 0;
  const changes: BookmarkRewriteChange[] = [];

  const categories = source.categories.map((cat) => {
    if (opts.categoryId && cat.id !== opts.categoryId) return cat;

    const links = cat.links.map((link) => {
      if (!linkMatchesRewriteScope(link, opts)) return link;
      scanned += 1;
      let nextUrl = link.url;
      if (stripTracking) {
        nextUrl = stripBookmarkTrackingParams(nextUrl) || nextUrl;
      }
      if (forceHttps) {
        nextUrl = forceBookmarkUrlHttps(nextUrl) || nextUrl;
      }
      if (nextUrl === link.url) return link;

      let title = link.title;
      if (title === link.url) title = nextUrl;

      changes.push({
        categoryId: cat.id,
        categoryTitle: cat.title,
        linkId: link.id,
        linkTitle: link.title,
        field: 'url',
        before: link.url,
        after: nextUrl
      });
      return { ...link, url: nextUrl, title, healthFinalUrl: undefined };
    });

    return { ...cat, links: dedupeCategoryLinks(links) };
  });

  const parts: string[] = [];
  if (stripTracking) parts.push('tracking params');
  if (forceHttps) parts.push('HTTPS');

  return finishRewrite(
    source,
    categories,
    changes,
    scanned,
    opts,
    `Cleaned %n% link(s) (${parts.join(' + ')}).`,
    `No links needed cleanup${opts.categoryId ? ' in this space' : ''}.`
  );
};

/**
 * Bulk find & replace in titles and/or URLs (and optional space titles).
 */
export const findReplacePublicBookmarks = (
  findRaw: string,
  replaceRaw: string,
  opts?: BookmarkRewriteScope & {
    inTitles?: boolean;
    inUrls?: boolean;
    inSpaceTitles?: boolean;
    caseSensitive?: boolean;
    useRegex?: boolean;
  }
): BookmarkRewriteResult => {
  const find = findRaw;
  if (!find) {
    return emptyRewriteResult('Enter text to find.');
  }

  const inTitles = opts?.inTitles !== false;
  const inUrls = opts?.inUrls !== false;
  const inSpaceTitles = opts?.inSpaceTitles === true;
  const caseSensitive = opts?.caseSensitive === true;
  const useRegex = opts?.useRegex === true;
  const replace = replaceRaw;

  if (!inTitles && !inUrls && !inSpaceTitles) {
    return emptyRewriteResult('Choose at least one target: titles, URLs, or space names.');
  }

  let regex: RegExp | null = null;
  if (useRegex) {
    try {
      regex = new RegExp(find, caseSensitive ? 'g' : 'gi');
    } catch {
      return emptyRewriteResult('Invalid regular expression.');
    }
  }

  const replaceIn = (value: string): string | null => {
    if (regex) {
      regex.lastIndex = 0;
      if (!regex.test(value)) return null;
      regex.lastIndex = 0;
      const next = value.replace(regex, replace);
      return next === value ? null : next;
    }
    if (caseSensitive) {
      if (!value.includes(find)) return null;
      return value.split(find).join(replace);
    }
    const needle = find.toLowerCase();
    if (!value.toLowerCase().includes(needle)) return null;
    const parts: string[] = [];
    let i = 0;
    while (i < value.length) {
      const idx = value.toLowerCase().indexOf(needle, i);
      if (idx === -1) {
        parts.push(value.slice(i));
        break;
      }
      parts.push(value.slice(i, idx), replace);
      i = idx + find.length;
    }
    return parts.join('');
  };

  const source = resolveRewriteSource(opts);
  let scanned = 0;
  const changes: BookmarkRewriteChange[] = [];

  const categories = source.categories.map((cat) => {
    if (opts?.categoryId && cat.id !== opts.categoryId) return cat;

    let spaceTitle = cat.title;
    if (inSpaceTitles) {
      const nextSpace = replaceIn(cat.title);
      if (nextSpace != null && nextSpace !== cat.title) {
        changes.push({
          categoryId: cat.id,
          categoryTitle: cat.title,
          field: 'spaceTitle',
          before: cat.title,
          after: nextSpace
        });
        spaceTitle = nextSpace;
      }
    }

    const links = cat.links.map((link) => {
      if (!linkMatchesRewriteScope(link, opts)) return link;
      scanned += 1;
      let url = link.url;
      let title = link.title;
      let touched = false;

      if (inUrls) {
        const nextUrl = replaceIn(url);
        if (nextUrl != null && nextUrl !== url) {
          changes.push({
            categoryId: cat.id,
            categoryTitle: cat.title,
            linkId: link.id,
            linkTitle: link.title,
            field: 'url',
            before: url,
            after: nextUrl
          });
          url = nextUrl;
          touched = true;
        }
      }
      if (inTitles) {
        const nextTitle = replaceIn(title);
        if (nextTitle != null && nextTitle !== title) {
          changes.push({
            categoryId: cat.id,
            categoryTitle: cat.title,
            linkId: link.id,
            linkTitle: link.title,
            field: 'title',
            before: title,
            after: nextTitle
          });
          title = nextTitle;
          touched = true;
        }
      }

      if (!touched) return link;
      return {
        ...link,
        url,
        title,
        healthFinalUrl: url !== link.url ? undefined : link.healthFinalUrl
      };
    });

    return { ...cat, title: spaceTitle, links: dedupeCategoryLinks(links) };
  });

  return finishRewrite(
    source,
    categories,
    changes,
    scanned,
    opts,
    `Replaced in %n% item(s): “${find}” → “${replace}”.`,
    `No matches for “${find}”${opts?.categoryId ? ' in this space' : ''}.`
  );
};

const urlsMeaningfullyDifferent = (a: string, b: string): boolean => {
  try {
    return normalizeBookmarkUrl(a) !== normalizeBookmarkUrl(b);
  } catch {
    return a.trim() !== b.trim();
  }
};

/** Links that redirected to a different final URL during health check. */
export const listRedirectUpdatableBookmarks = (
  categoryId?: string,
  data?: PublicBookmarksData
): Array<{
  categoryId: string;
  categoryTitle: string;
  link: PublicBookmarkLink;
  finalUrl: string;
}> => {
  const source = data ?? getPublicBookmarks();
  const out: Array<{
    categoryId: string;
    categoryTitle: string;
    link: PublicBookmarkLink;
    finalUrl: string;
  }> = [];

  for (const cat of source.categories) {
    if (categoryId && cat.id !== categoryId) continue;
    for (const link of cat.links) {
      const finalUrl = (link.healthFinalUrl || '').trim();
      if (!finalUrl) continue;
      if (!urlsMeaningfullyDifferent(link.url, finalUrl)) continue;
      // Prefer redirected status, but any stored finalUrl from check is usable
      out.push({
        categoryId: cat.id,
        categoryTitle: cat.title,
        link,
        finalUrl
      });
    }
  }
  return out;
};

/**
 * Update bookmark URLs to the final redirect target from the last health check.
 */
export const applyPublicBookmarkRedirectUrls = (
  opts?: BookmarkRewriteScope & { linkIds?: string[] }
): BookmarkRewriteResult => {
  const source = resolveRewriteSource(opts);
  const candidates = listRedirectUpdatableBookmarks(opts?.categoryId, source).filter((c) =>
    linkMatchesRewriteScope(c.link, opts)
  );
  const idFilter =
    opts?.linkIds && opts.linkIds.length > 0 ? new Set(opts.linkIds) : null;
  const selected = idFilter
    ? candidates.filter((c) => idFilter.has(c.link.id))
    : candidates;

  if (selected.length === 0) {
    return emptyRewriteResult(
      'No redirected URLs to update. Run Check links first; only links that landed on a different final URL are listed.',
      true
    );
  }

  let scanned = 0;
  const changes: BookmarkRewriteChange[] = [];
  const byCat = new Map<string, Set<string>>();
  for (const c of selected) {
    if (!byCat.has(c.categoryId)) byCat.set(c.categoryId, new Set());
    byCat.get(c.categoryId)!.add(c.link.id);
  }

  const categories = source.categories.map((cat) => {
    const ids = byCat.get(cat.id);
    if (!ids) return cat;

    const links = cat.links.map((link) => {
      if (!ids.has(link.id)) return link;
      scanned += 1;
      const finalUrl = (link.healthFinalUrl || '').trim();
      if (!finalUrl || !urlsMeaningfullyDifferent(link.url, finalUrl)) return link;

      let title = link.title;
      if (title === link.url) title = finalUrl;

      changes.push({
        categoryId: cat.id,
        categoryTitle: cat.title,
        linkId: link.id,
        linkTitle: link.title,
        field: 'url',
        before: link.url,
        after: finalUrl
      });

      return {
        ...link,
        url: finalUrl,
        title,
        healthFinalUrl: undefined,
        healthStatus: 'healthy',
        healthError: undefined
      };
    });

    return { ...cat, links: dedupeCategoryLinks(links) };
  });

  return finishRewrite(
    source,
    categories,
    changes,
    scanned,
    opts,
    `Updated %n% link(s) to their final redirect URL(s).`,
    'No redirected URLs to update.'
  );
};

/** Normalize scheme / www / ports / trailing slash. */
export const normalizePublicBookmarkUrls = (
  opts: BookmarkRewriteScope & {
    wwwMode?: 'add' | 'remove' | 'keep';
    trailingSlash?: 'add' | 'remove' | 'keep';
    stripDefaultPorts?: boolean;
    forceHttps?: boolean;
  }
): BookmarkRewriteResult => {
  const wwwMode = opts.wwwMode || 'keep';
  const trailingSlash = opts.trailingSlash || 'keep';
  const stripDefaultPorts = opts.stripDefaultPorts !== false;
  const forceHttps = opts.forceHttps === true;

  if (
    wwwMode === 'keep' &&
    trailingSlash === 'keep' &&
    !stripDefaultPorts &&
    !forceHttps
  ) {
    return emptyRewriteResult('Choose at least one normalize option.');
  }

  const transform = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      let changed = false;

      if (forceHttps && parsed.protocol === 'http:') {
        parsed.protocol = 'https:';
        changed = true;
      }

      if (stripDefaultPorts) {
        if (
          (parsed.protocol === 'https:' && parsed.port === '443') ||
          (parsed.protocol === 'http:' && parsed.port === '80')
        ) {
          parsed.port = '';
          changed = true;
        }
      }

      const host = parsed.hostname;
      if (wwwMode === 'add' && !host.toLowerCase().startsWith('www.')) {
        parsed.hostname = `www.${host}`;
        changed = true;
      } else if (wwwMode === 'remove' && host.toLowerCase().startsWith('www.')) {
        parsed.hostname = host.slice(4);
        changed = true;
      }

      let path = parsed.pathname || '/';
      if (trailingSlash === 'add' && path !== '/' && !path.endsWith('/')) {
        parsed.pathname = `${path}/`;
        changed = true;
      } else if (trailingSlash === 'remove' && path.length > 1 && path.endsWith('/')) {
        parsed.pathname = path.replace(/\/+$/, '') || '/';
        changed = true;
      }

      const next = parsed.toString();
      return changed && next !== url ? next : null;
    } catch {
      return null;
    }
  };

  return mapUrlRewrite(opts, transform, 'Normalized %n% link(s).', 'No links needed URL normalize.');
};

/** Decode path encoding, lowercase host, collapse duplicate slashes. */
export const cleanupPublicBookmarkEncoding = (
  opts?: BookmarkRewriteScope
): BookmarkRewriteResult => {
  const transform = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      let changed = false;

      const lowerHost = parsed.hostname.toLowerCase();
      if (lowerHost !== parsed.hostname) {
        parsed.hostname = lowerHost;
        changed = true;
      }

      let path = parsed.pathname || '/';
      const collapsed = path.replace(/\/{2,}/g, '/') || '/';
      if (collapsed !== path) {
        path = collapsed;
        changed = true;
      }

      try {
        const decoded = decodeURI(path);
        if (decoded !== path) {
          path = decoded;
          changed = true;
        }
      } catch {
        // keep encoded path
      }

      parsed.pathname = path;
      const next = parsed.toString();
      return changed && next !== url ? next : null;
    } catch {
      return null;
    }
  };

  return mapUrlRewrite(
    opts,
    transform,
    'Cleaned encoding on %n% link(s).',
    'No encoding cleanup needed.'
  );
};

const mapUrlRewrite = (
  opts: BookmarkRewriteScope | undefined,
  transform: (url: string) => string | null,
  successMessage: string,
  noneMessage: string
): BookmarkRewriteResult => {
  const source = resolveRewriteSource(opts);
  let scanned = 0;
  const changes: BookmarkRewriteChange[] = [];

  const categories = source.categories.map((cat) => {
    if (opts?.categoryId && cat.id !== opts.categoryId) return cat;

    const links = cat.links.map((link) => {
      if (!linkMatchesRewriteScope(link, opts)) return link;
      scanned += 1;
      const nextUrl = transform(link.url);
      if (!nextUrl || nextUrl === link.url) return link;
      let title = link.title;
      if (title === link.url) title = nextUrl;
      changes.push({
        categoryId: cat.id,
        categoryTitle: cat.title,
        linkId: link.id,
        linkTitle: link.title,
        field: 'url',
        before: link.url,
        after: nextUrl
      });
      return { ...link, url: nextUrl, title, healthFinalUrl: undefined };
    });

    return { ...cat, links: dedupeCategoryLinks(links) };
  });

  return finishRewrite(source, categories, changes, scanned, opts, successMessage, noneMessage);
};

/**
 * Move links into the space that matches their current host domain (create if needed).
 */
export const regroupPublicBookmarksByHost = (
  opts?: BookmarkRewriteScope
): BookmarkRewriteResult => {
  const source = resolveRewriteSource(opts);
  let scanned = 0;
  const changes: BookmarkRewriteChange[] = [];

  // Start with a mutable copy of every space
  const byId = new Map<string, PublicBookmarkCategory>();
  for (const cat of source.categories) {
    byId.set(cat.id, { ...cat, links: [...cat.links] });
  }

  const ensureDest = (domainKey: string): PublicBookmarkCategory => {
    const existing = findCategoryForDomain([...byId.values()], domainKey);
    if (existing) {
      const live = byId.get(existing.id);
      if (live) return live;
    }
    const titleGuess =
      domainKey === 'misc'
        ? 'Miscellaneous'
        : domainKey.charAt(0).toUpperCase() + domainKey.slice(1);
    const created: PublicBookmarkCategory = {
      id: generateUuid(),
      title: titleGuess,
      emoji: '🌐',
      themeColor: 'sky',
      links: []
    };
    byId.set(created.id, created);
    return created;
  };

  for (const cat of source.categories) {
    if (opts?.categoryId && cat.id !== opts.categoryId) continue;

    const liveCat = byId.get(cat.id);
    if (!liveCat) continue;

    const remaining: PublicBookmarkLink[] = [];
    for (const link of [...liveCat.links]) {
      if (!linkMatchesRewriteScope(link, opts)) {
        remaining.push(link);
        continue;
      }
      scanned += 1;
      const domainKey = getBookmarkBaseDomain(link.url) || 'misc';
      const dest = ensureDest(domainKey);
      if (dest.id === liveCat.id) {
        remaining.push(link);
        continue;
      }
      // Remove from current (we'll set remaining at end), add to dest
      dest.links.push(link);
      changes.push({
        categoryId: dest.id,
        categoryTitle: dest.title,
        linkId: link.id,
        linkTitle: link.title,
        field: 'space',
        before: cat.title,
        after: dest.title
      });
    }
    liveCat.links = remaining;
  }

  const categories = [...byId.values()]
    .filter((c) => c.links.length > 0)
    .map((c) => ({ ...c, links: dedupeCategoryLinks(c.links) }));

  // Preserve original order for existing ids, append new spaces at end
  const order = source.categories.map((c) => c.id);
  categories.sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.title.localeCompare(b.title);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  return finishRewrite(
    source,
    categories,
    changes,
    scanned,
    opts,
    `Moved %n% link(s) into matching domain space(s).`,
    'All links already sit in matching domain spaces.'
  );
};

/** Suggest common URL fixes from health / scheme issues. */
export const suggestPublicBookmarkUrlFixes = (
  opts?: BookmarkRewriteScope
): BookmarkRewriteResult => {
  const transform = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      let changed = false;
      if (parsed.protocol === 'http:') {
        parsed.protocol = 'https:';
        changed = true;
      }
      // Prefer bare host without www for broken health often; only strip www if present with http was issue
      // Keep conservative: https only unless path looks like double-slash host typo
      const next = parsed.toString();
      return changed && next !== url ? next : null;
    } catch {
      return null;
    }
  };

  const source = resolveRewriteSource(opts);
  let scanned = 0;
  const changes: BookmarkRewriteChange[] = [];

  const categories = source.categories.map((cat) => {
    if (opts?.categoryId && cat.id !== opts.categoryId) return cat;
    const links = cat.links.map((link) => {
      if (!linkMatchesRewriteScope(link, opts)) return link;
      const broken =
        isRemovableBrokenBookmarkHealth(link.healthStatus) ||
        link.url.startsWith('http://');
      if (!broken && link.healthStatus !== 'redirected') return link;
      scanned += 1;

      let nextUrl = transform(link.url);
      // Also try www flip when broken
      if (!nextUrl && isRemovableBrokenBookmarkHealth(link.healthStatus)) {
        try {
          const p = new URL(link.url);
          if (p.hostname.toLowerCase().startsWith('www.')) {
            p.hostname = p.hostname.slice(4);
            nextUrl = p.toString();
          } else {
            p.hostname = `www.${p.hostname}`;
            nextUrl = p.toString();
          }
          if (nextUrl === link.url) nextUrl = null;
        } catch {
          nextUrl = null;
        }
      }

      if (!nextUrl || nextUrl === link.url) return link;
      let title = link.title;
      if (title === link.url) title = nextUrl;
      changes.push({
        categoryId: cat.id,
        categoryTitle: cat.title,
        linkId: link.id,
        linkTitle: link.title,
        field: 'url',
        before: link.url,
        after: nextUrl
      });
      return { ...link, url: nextUrl, title, healthFinalUrl: undefined };
    });
    return { ...cat, links: dedupeCategoryLinks(links) };
  });

  return finishRewrite(
    source,
    categories,
    changes,
    scanned,
    opts,
    `Applied suggested fixes to %n% link(s).`,
    'No suggested fixes for broken/http links.'
  );
};

export type BookmarkRewriteRecipeStep =
  | { type: 'domain'; from: string; to: string }
  | { type: 'path'; from: string; to: string }
  | { type: 'cleanup'; stripTracking?: boolean; forceHttps?: boolean }
  | {
      type: 'find-replace';
      find: string;
      replace: string;
      useRegex?: boolean;
      inTitles?: boolean;
      inUrls?: boolean;
      inSpaceTitles?: boolean;
      caseSensitive?: boolean;
    }
  | {
      type: 'normalize';
      wwwMode?: 'add' | 'remove' | 'keep';
      trailingSlash?: 'add' | 'remove' | 'keep';
      stripDefaultPorts?: boolean;
      forceHttps?: boolean;
    }
  | { type: 'encoding' }
  | { type: 'redirects' }
  | { type: 'regroup' }
  | { type: 'suggest-fixes' };

export interface BookmarkRewriteRecipe {
  id: string;
  name: string;
  createdAt: string;
  steps: BookmarkRewriteRecipeStep[];
}

export const listBookmarkRewriteRecipes = (): BookmarkRewriteRecipe[] => {
  try {
    const raw = localStorage.getItem(rewriteMetaStorageKey(REWRITE_RECIPES_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) => r && typeof r.id === 'string' && typeof r.name === 'string' && Array.isArray(r.steps)
    ) as BookmarkRewriteRecipe[];
  } catch {
    return [];
  }
};

export const saveBookmarkRewriteRecipe = (
  name: string,
  steps: BookmarkRewriteRecipeStep[]
): BookmarkRewriteRecipe[] => {
  const trimmed = name.trim();
  if (!trimmed || steps.length === 0) return listBookmarkRewriteRecipes();
  const recipes = listBookmarkRewriteRecipes();
  const next: BookmarkRewriteRecipe = {
    id: generateUuid(),
    name: trimmed.slice(0, 80),
    createdAt: new Date().toISOString(),
    steps
  };
  const all = [next, ...recipes].slice(0, 30);
  try {
    localStorage.setItem(rewriteMetaStorageKey(REWRITE_RECIPES_KEY), JSON.stringify(all));
  } catch {
    // ignore
  }
  return all;
};

export const deleteBookmarkRewriteRecipe = (id: string): BookmarkRewriteRecipe[] => {
  const all = listBookmarkRewriteRecipes().filter((r) => r.id !== id);
  try {
    localStorage.setItem(rewriteMetaStorageKey(REWRITE_RECIPES_KEY), JSON.stringify(all));
  } catch {
    // ignore
  }
  return all;
};

const runRecipeStep = (
  step: BookmarkRewriteRecipeStep,
  scope: BookmarkRewriteScope
): BookmarkRewriteResult => {
  switch (step.type) {
    case 'domain':
      return rewritePublicBookmarkDomains(step.from, step.to, {
        ...scope,
        renameMatchingSpaces: true
      });
    case 'path':
      return rewritePublicBookmarkPaths(step.from, step.to, scope);
    case 'cleanup':
      return cleanupPublicBookmarkUrls({
        ...scope,
        stripTracking: step.stripTracking !== false,
        forceHttps: step.forceHttps === true
      });
    case 'find-replace':
      return findReplacePublicBookmarks(step.find, step.replace, {
        ...scope,
        useRegex: step.useRegex,
        inTitles: step.inTitles,
        inUrls: step.inUrls,
        inSpaceTitles: step.inSpaceTitles,
        caseSensitive: step.caseSensitive
      });
    case 'normalize':
      return normalizePublicBookmarkUrls({
        ...scope,
        wwwMode: step.wwwMode,
        trailingSlash: step.trailingSlash,
        stripDefaultPorts: step.stripDefaultPorts,
        forceHttps: step.forceHttps
      });
    case 'encoding':
      return cleanupPublicBookmarkEncoding(scope);
    case 'redirects':
      return applyPublicBookmarkRedirectUrls(scope);
    case 'regroup':
      return regroupPublicBookmarksByHost(scope);
    case 'suggest-fixes':
      return suggestPublicBookmarkUrlFixes(scope);
    default:
      return emptyRewriteResult('Unknown pipeline step.');
  }
};

/**
 * Run multiple rewrite steps in order. Dry-run previews cumulative changes
 * without saving; apply writes once at the end (with a single undo snapshot).
 */
export const runPublicBookmarkRewritePipeline = (
  steps: BookmarkRewriteRecipeStep[],
  opts?: BookmarkRewriteScope
): BookmarkRewriteResult => {
  if (!steps.length) {
    return emptyRewriteResult('Add at least one pipeline step.');
  }

  const original = resolveRewriteSource(opts);
  let working: PublicBookmarksData = {
    categories: original.categories.map((c) => ({
      ...c,
      links: c.links.map((l) => ({ ...l }))
    })),
    updatedAt: original.updatedAt
  };

  const allChanges: BookmarkRewriteChange[] = [];
  let scanned = 0;
  let lastMessage = '';

  for (const step of steps) {
    const result = runRecipeStep(step, {
      ...opts,
      sourceData: working,
      dryRun: false,
      deferPersist: true
    });
    if (!result.ok) {
      return {
        ...result,
        data: original,
        changes: allChanges
      };
    }
    working = result.data;
    allChanges.push(...result.changes);
    scanned += result.scanned;
    lastMessage = result.message;
  }

  if (allChanges.length === 0) {
    return {
      data: original,
      ok: true,
      message: 'Pipeline produced no changes.',
      scanned,
      updated: 0,
      changes: []
    };
  }

  if (opts?.dryRun) {
    const updated = new Set(
      allChanges.filter((c) => c.linkId).map((c) => `${c.categoryId}:${c.linkId}`)
    ).size;
    return {
      data: original,
      ok: true,
      message: `Pipeline preview: ${allChanges.length} change(s) across ${updated || 1} link(s) (${steps.length} step(s)).`,
      scanned,
      updated: updated || allChanges.length,
      changes: allChanges
    };
  }

  pushBookmarkRewriteUndoSnapshot(original);
  const next = persist(working.categories);
  const updated = new Set(
    allChanges.filter((c) => c.linkId).map((c) => `${c.categoryId}:${c.linkId}`)
  ).size;
  return {
    data: next,
    ok: true,
    message: `Pipeline applied ${steps.length} step(s): updated ${updated || allChanges.length} link(s). ${lastMessage}`,
    scanned,
    updated: updated || allChanges.length,
    changes: allChanges
  };
};

/** Download rewrite preview changes as CSV. */
export const downloadBookmarkRewritePreviewCsv = (
  changes: BookmarkRewriteChange[],
  filename = 'bookmark-rewrite-preview.csv'
): string => {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['field', 'space', 'link', 'before', 'after'].map(esc).join(','),
    ...changes.map((c) =>
      [c.field, c.categoryTitle, c.linkTitle || '', c.before, c.after].map(esc).join(',')
    )
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return `Downloaded ${changes.length} change(s) as CSV.`;
};

const BOOKMARK_EXPORT_GROUP = 'Bookmarks';

const isThemeColor = (value: string | undefined): value is ThemeColor =>
  !!value && (THEME_COLORS as readonly string[]).includes(value);

const slugifySpaceName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'space';

const triggerJsonDownload = (data: unknown, filename: string): void => {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Convert a guest bookmark space into a LinkNest Tile suitable for
 * Admin / TileGrid “Import Space” (SpaceExportFile v1.3).
 */
export const bookmarkCategoryToSpaceTile = (
  cat: PublicBookmarkCategory
): Tile => {
  const now = Date.now();
  const themeColor: ThemeColor = isThemeColor(cat.themeColor)
    ? cat.themeColor
    : 'sky';
  const emoji = (cat.emoji && cat.emoji.trim()) || '🌐';
  const linkCount = cat.links.length;

  return {
    id: generateUuid(),
    title: cat.title,
    description:
      linkCount === 1
        ? `1 bookmark from ${cat.title}`
        : `${linkCount} bookmarks from ${cat.title}`,
    emoji,
    themeColor,
    group: BOOKMARK_EXPORT_GROUP,
    createdAt: now,
    visibility: 'public',
    published: true,
    showEmoji: true,
    showTitle: true,
    showDescription: true,
    tabs: [
      {
        id: generateUuid(),
        title: 'Links',
        position: 0,
        visibility: 'public',
        published: true,
        sections: [
          {
            id: generateUuid(),
            title: 'Bookmarks',
            emoji,
            visibility: 'public',
            published: true,
            position: 0,
            links: cat.links.map((link, index) => ({
              id: generateUuid(),
              label: link.title || link.url,
              url: link.url,
              visibility: 'public' as const,
              published: true,
              position: index
            }))
          }
        ]
      }
    ]
  };
};

/** Download one bookmark space as LinkNest Import Space JSON (type: tile). */
export const downloadPublicBookmarkCategoryAsSpaceJson = (
  categoryId: string,
  data?: PublicBookmarksData
): { success: boolean; message: string; linkCount: number } => {
  const source = data ?? getPublicBookmarks();
  const cat = source.categories.find((c) => c.id === categoryId);
  if (!cat || cat.links.length === 0) {
    return {
      success: false,
      message: 'Nothing to export in this space.',
      linkCount: 0
    };
  }

  try {
    const tile = bookmarkCategoryToSpaceTile(cat);
    const payload: SpaceExportFile = {
      version: '1.3',
      type: 'tile',
      exportedAt: Date.now(),
      tile
    };
    triggerJsonDownload(payload, `linknest-space-${slugifySpaceName(cat.title)}.json`);
    return {
      success: true,
      message: `Exported “${cat.title}” as LinkNest space JSON (${cat.links.length} link${cat.links.length === 1 ? '' : 's'}). Use Admin → Import Spaces or Import Space to bring it into the app.`,
      linkCount: cat.links.length
    };
  } catch (error) {
    console.error('Failed to export bookmark space JSON:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to export space JSON.',
      linkCount: cat.links.length
    };
  }
};

/** Download all bookmark spaces as LinkNest Import Spaces JSON (type: all_categories). */
export const downloadPublicBookmarksAsSpacesJson = (
  data?: PublicBookmarksData
): { success: boolean; message: string; linkCount: number; spaceCount: number } => {
  const source = data ?? getPublicBookmarks();
  const cats = source.categories.filter((c) => c.links.length > 0);
  const total = cats.reduce((sum, c) => sum + c.links.length, 0);
  if (cats.length === 0) {
    return {
      success: false,
      message: 'No bookmarks to export.',
      linkCount: 0,
      spaceCount: 0
    };
  }

  try {
    const tiles = cats.map((cat) => bookmarkCategoryToSpaceTile(cat));
    const payload: SpaceExportFile = {
      version: '1.3',
      type: 'all_categories',
      exportedAt: Date.now(),
      tiles,
      categories: [BOOKMARK_EXPORT_GROUP]
    };
    const stamp = new Date().toISOString().slice(0, 10);
    triggerJsonDownload(payload, `linknest-bookmark-spaces-${stamp}.json`);
    return {
      success: true,
      message: `Exported ${cats.length} space${cats.length === 1 ? '' : 's'} (${total} link${total === 1 ? '' : 's'}) as LinkNest JSON. Import via Admin → Import Spaces.`,
      linkCount: total,
      spaceCount: cats.length
    };
  } catch (error) {
    console.error('Failed to export bookmark spaces JSON:', error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to export spaces JSON.',
      linkCount: total,
      spaceCount: cats.length
    };
  }
};

export const renamePublicBookmarkCategory = (
  categoryId: string,
  title: string
): PublicBookmarksData => {
  const trimmed = title.trim();
  if (!trimmed) return getPublicBookmarks();
  const data = getPublicBookmarks();
  const categories = data.categories.map((cat) =>
    cat.id === categoryId ? { ...cat, title: trimmed } : cat
  );
  return persist(categories);
};

export const updatePublicBookmarkCategory = (
  categoryId: string,
  patch: Partial<Pick<PublicBookmarkCategory, 'title' | 'emoji' | 'themeColor' | 'pinned'>>
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  let categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat;
    const next = { ...cat };
    if (typeof patch.title === 'string' && patch.title.trim()) {
      next.title = patch.title.trim();
    }
    if (patch.emoji !== undefined) next.emoji = patch.emoji || undefined;
    if (patch.themeColor !== undefined) next.themeColor = patch.themeColor || undefined;
    if (patch.pinned !== undefined) next.pinned = patch.pinned || undefined;
    return next;
  });

  if (patch.pinned !== undefined) {
    const cat = categories.find((c) => c.id === categoryId);
    if (cat) {
      categories = categories.filter((c) => c.id !== categoryId);
      if (patch.pinned) {
        categories = [cat, ...categories];
      } else {
        const pinnedCount = categories.filter((c) => c.pinned).length;
        categories = [
          ...categories.slice(0, pinnedCount),
          cat,
          ...categories.slice(pinnedCount)
        ];
      }
    }
  }

  return persist(categories);
};

export const setPublicBookmarkLinkPinned = (
  categoryId: string,
  linkId: string,
  pinned: boolean
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat;
    let links = cat.links.map((l) =>
      l.id === linkId ? { ...l, pinned: pinned || undefined } : l
    );
    const link = links.find((l) => l.id === linkId);
    if (!link) return cat;
    links = links.filter((l) => l.id !== linkId);
    if (pinned) {
      links = [link, ...links];
    } else {
      const pinnedCount = links.filter((l) => l.pinned).length;
      links = [...links.slice(0, pinnedCount), link, ...links.slice(pinnedCount)];
    }
    return { ...cat, links };
  });
  return persist(categories);
};

export const recordPublicBookmarkOpened = (
  categoryId: string,
  linkId: string
): PublicBookmarksData => {
  const now = new Date().toISOString();
  const data = getPublicBookmarks();
  const categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat;
    return {
      ...cat,
      lastOpenedAt: now,
      links: cat.links.map((l) =>
        l.id === linkId ? { ...l, lastOpenedAt: now } : l
      )
    };
  });
  return persist(categories);
};

export const addPublicBookmarkLink = (
  categoryId: string,
  input: { title?: string; url: string }
): { data: PublicBookmarksData; ok: boolean; message: string } => {
  let url = input.url.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    // Validate URL shape
    void new URL(url);
  } catch {
    return {
      data: getPublicBookmarks(),
      ok: false,
      message: 'Enter a valid URL (e.g. https://example.com).'
    };
  }

  const data = getPublicBookmarks();
  const cat = data.categories.find((c) => c.id === categoryId);
  if (!cat) {
    return { data, ok: false, message: 'Space not found.' };
  }

  const normalized = normalizeBookmarkUrl(url);
  const exists = data.categories.some((c) =>
    c.links.some((l) => normalizeBookmarkUrl(l.url) === normalized)
  );
  if (exists) {
    return {
      data,
      ok: false,
      message: 'That URL is already in Your Bookmarks.'
    };
  }

  const title =
    (input.title && input.title.trim()) ||
    (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    })();

  const categories = data.categories.map((c) =>
    c.id === categoryId
      ? {
          ...c,
          links: [
            ...c.links,
            { id: generateUuid(), title, url }
          ]
        }
      : c
  );
  const next = persist(categories);
  return { data: next, ok: true, message: `Added “${title}”.` };
};

export const movePublicBookmarkLinkToCategory = (
  fromCategoryId: string,
  linkId: string,
  toCategoryId: string
): PublicBookmarksData => {
  if (fromCategoryId === toCategoryId) return getPublicBookmarks();
  const data = getPublicBookmarks();
  const from = data.categories.find((c) => c.id === fromCategoryId);
  const link = from?.links.find((l) => l.id === linkId);
  if (!link || !data.categories.some((c) => c.id === toCategoryId)) {
    return data;
  }

  const categories = data.categories
    .map((cat) => {
      if (cat.id === fromCategoryId) {
        return { ...cat, links: cat.links.filter((l) => l.id !== linkId) };
      }
      if (cat.id === toCategoryId) {
        return { ...cat, links: [...cat.links, link] };
      }
      return cat;
    })
    .filter((cat) => cat.links.length > 0);

  return persist(categories);
};

export const findDuplicatePublicBookmarkGroups = (
  data?: PublicBookmarksData
): PublicBookmarkDupeGroup[] => {
  const source = data ?? getPublicBookmarks();
  const map = new Map<string, PublicBookmarkDupeGroup>();

  for (const cat of source.categories) {
    for (const link of cat.links) {
      const key = normalizeBookmarkUrl(link.url);
      const existing = map.get(key);
      const entry = { categoryId: cat.id, categoryTitle: cat.title, link };
      if (existing) {
        existing.entries.push(entry);
      } else {
        map.set(key, {
          normalizedUrl: key,
          url: link.url,
          entries: [entry]
        });
      }
    }
  }

  return Array.from(map.values()).filter((g) => g.entries.length > 1);
};

/** Keep one link per duplicated URL (prefer pinned, then longer title). */
export const removeDuplicatePublicBookmarks = (
  data?: PublicBookmarksData
): { data: PublicBookmarksData; removed: number } => {
  const source = data ?? getPublicBookmarks();
  const groups = findDuplicatePublicBookmarkGroups(source);
  if (groups.length === 0) {
    return { data: source, removed: 0 };
  }

  const removeIds = new Set<string>();
  for (const group of groups) {
    const sorted = [...group.entries].sort((a, b) => {
      if (!!a.link.pinned !== !!b.link.pinned) return a.link.pinned ? -1 : 1;
      return b.link.title.length - a.link.title.length;
    });
    for (let i = 1; i < sorted.length; i++) {
      removeIds.add(sorted[i].link.id);
    }
  }

  const categories = source.categories
    .map((cat) => ({
      ...cat,
      links: cat.links.filter((l) => !removeIds.has(l.id))
    }))
    .filter((cat) => cat.links.length > 0);

  return { data: persist(categories), removed: removeIds.size };
};

/** Links never opened in this browser (no lastOpenedAt). */
export const findNeverOpenedPublicBookmarks = (
  data?: PublicBookmarksData
): Array<{ categoryId: string; link: PublicBookmarkLink }> => {
  const source = data ?? getPublicBookmarks();
  const out: Array<{ categoryId: string; link: PublicBookmarkLink }> = [];
  for (const cat of source.categories) {
    for (const link of cat.links) {
      if (!link.lastOpenedAt) out.push({ categoryId: cat.id, link });
    }
  }
  return out;
};

export const removeNeverOpenedPublicBookmarks = (
  data?: PublicBookmarksData
): { data: PublicBookmarksData; removed: number } => {
  const source = data ?? getPublicBookmarks();
  let removed = 0;
  const categories = source.categories
    .map((cat) => {
      const links = cat.links.filter((l) => {
        if (l.lastOpenedAt) return true;
        removed += 1;
        return false;
      });
      return { ...cat, links };
    })
    .filter((cat) => cat.links.length > 0);

  if (removed === 0) return { data: source, removed: 0 };
  return { data: persist(categories), removed };
};

export const countBrokenPublicBookmarks = (
  data?: PublicBookmarksData,
  categoryId?: string
): number => {
  const source = data ?? getPublicBookmarks();
  return source.categories.reduce((sum, cat) => {
    if (categoryId && cat.id !== categoryId) return sum;
    return (
      sum +
      cat.links.filter((l) => isRemovableBrokenBookmarkHealth(l.healthStatus)).length
    );
  }, 0);
};

export const setPublicBookmarkLinkHealth = (
  categoryId: string,
  linkId: string,
  health: {
    status: string;
    httpCode?: number | null;
    error?: string | null;
    checkedAt?: number | string;
    finalUrl?: string | null;
  } | null
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const checkedAt =
    health == null
      ? undefined
      : typeof health.checkedAt === 'number'
        ? new Date(health.checkedAt * (health.checkedAt < 1e12 ? 1000 : 1)).toISOString()
        : typeof health.checkedAt === 'string'
          ? health.checkedAt
          : new Date().toISOString();

  const categories = data.categories.map((cat) => {
    if (cat.id !== categoryId) return cat;
    return {
      ...cat,
      links: cat.links.map((l) => {
        if (l.id !== linkId) return l;
        if (!health) {
          const {
            healthStatus: _s,
            healthHttpCode: _c,
            healthError: _e,
            healthCheckedAt: _a,
            healthFinalUrl: _f,
            ...rest
          } = l;
          return rest;
        }
        const finalUrl =
          typeof health.finalUrl === 'string' && health.finalUrl.trim()
            ? health.finalUrl.trim()
            : undefined;
        return {
          ...l,
          healthStatus: health.status,
          healthHttpCode: health.httpCode ?? null,
          healthError: health.error ?? undefined,
          healthCheckedAt: checkedAt,
          healthFinalUrl: finalUrl
        };
      })
    };
  });
  return persist(categories);
};

export const setPublicBookmarkLinksHealthBatch = (
  updates: Array<{
    categoryId: string;
    linkId: string;
    health: {
      status: string;
      httpCode?: number | null;
      error?: string | null;
      checkedAt?: number | string;
      finalUrl?: string | null;
    } | null;
  }>
): PublicBookmarksData => {
  let data = getPublicBookmarks();
  for (const u of updates) {
    // Apply in memory then persist once
    const categories = data.categories.map((cat) => {
      if (cat.id !== u.categoryId) return cat;
      return {
        ...cat,
        links: cat.links.map((l) => {
          if (l.id !== u.linkId) return l;
          if (!u.health) {
            const {
              healthStatus: _s,
              healthHttpCode: _c,
              healthError: _e,
              healthCheckedAt: _a,
              healthFinalUrl: _f,
              ...rest
            } = l;
            return rest;
          }
          const checkedAt =
            typeof u.health.checkedAt === 'number'
              ? new Date(
                  u.health.checkedAt * (u.health.checkedAt < 1e12 ? 1000 : 1)
                ).toISOString()
              : typeof u.health.checkedAt === 'string'
                ? u.health.checkedAt
                : new Date().toISOString();
          const finalUrl =
            typeof u.health.finalUrl === 'string' && u.health.finalUrl.trim()
              ? u.health.finalUrl.trim()
              : undefined;
          return {
            ...l,
            healthStatus: u.health.status,
            healthHttpCode: u.health.httpCode ?? null,
            healthError: u.health.error ?? undefined,
            healthCheckedAt: checkedAt,
            healthFinalUrl: finalUrl
          };
        })
      };
    });
    data = { categories, updatedAt: new Date().toISOString() };
  }
  setPublicBookmarks(data);
  return getPublicBookmarks();
};

/** Remove links marked broken or timed out (after a health check). */
export const removeBrokenPublicBookmarks = (
  categoryId?: string,
  data?: PublicBookmarksData
): { data: PublicBookmarksData; removed: number } => {
  const source = data ?? getPublicBookmarks();
  let removed = 0;
  const categories = source.categories
    .map((cat) => {
      if (categoryId && cat.id !== categoryId) return cat;
      const links = cat.links.filter((l) => {
        if (!isRemovableBrokenBookmarkHealth(l.healthStatus)) return true;
        removed += 1;
        return false;
      });
      return { ...cat, links };
    })
    .filter((cat) => cat.links.length > 0);

  if (removed === 0) return { data: source, removed: 0 };
  return { data: persist(categories), removed };
};

export const getPublicFavoritesSubTab = (): PublicFavoritesSubTab => {
  try {
    const raw = localStorage.getItem(storageKey(SUBTAB_KEY));
    return raw === 'bookmarks' ? 'bookmarks' : 'favorites';
  } catch {
    return 'favorites';
  }
};

export const setPublicFavoritesSubTab = (tab: PublicFavoritesSubTab): void => {
  try {
    if (!isLocalStorageAvailable()) return;
    localStorage.setItem(storageKey(SUBTAB_KEY), tab);
  } catch (error) {
    console.error('Failed to save public favorites sub-tab:', error);
  }
};
