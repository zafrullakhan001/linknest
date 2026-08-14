import { getAppBasePath, getAppStorageScope } from './apiHelpers';
import { generateUuid } from './idService';
import {
  parseHTMLBookmarks,
  deduplicateBookmarks,
  groupBookmarksByDomain,
  normalizeBookmarkUrl,
  getBookmarkBaseDomain
} from './bookmarkImportService';

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
  | 'links-min';

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
  if (mode === 'manual') return [...pinned, ...rest];

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
