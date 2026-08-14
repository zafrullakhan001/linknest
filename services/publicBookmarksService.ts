import { getAppBasePath, getAppStorageScope } from './apiHelpers';
import { generateUuid } from './idService';
import {
  parseHTMLBookmarks,
  deduplicateBookmarks,
  groupBookmarksByDomain
} from './bookmarkImportService';

/**
 * Guest "Your Bookmarks" — Chrome HTML import stored in scoped localStorage.
 * Separate from public favorites star lists and from Fav Organizer (auth/server tiles).
 */

const BOOKMARKS_KEY = 'linknest_public_bookmarks';
const SUBTAB_KEY = 'linknest_public_favorites_subtab';

export type PublicFavoritesSubTab = 'favorites' | 'bookmarks';

export interface PublicBookmarkLink {
  id: string;
  title: string;
  url: string;
}

export interface PublicBookmarkCategory {
  id: string;
  title: string;
  emoji?: string;
  themeColor?: string;
  links: PublicBookmarkLink[];
}

export interface PublicBookmarksData {
  categories: PublicBookmarkCategory[];
  updatedAt: string;
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

const normalizeCategory = (raw: unknown): PublicBookmarkCategory | null => {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) return null;

  const linksRaw = Array.isArray(obj.links) ? obj.links : [];
  const links: PublicBookmarkLink[] = [];
  const seen = new Set<string>();

  for (const entry of linksRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const link = entry as Record<string, unknown>;
    const url = typeof link.url === 'string' ? link.url.trim() : '';
    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) continue;
    const id =
      typeof link.id === 'string' && link.id.trim()
        ? link.id.trim()
        : generateUuid();
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({
      id,
      title:
        (typeof link.title === 'string' && link.title.trim()) ||
        (typeof link.label === 'string' && link.label.trim()) ||
        url,
      url
    });
  }

  return {
    id:
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim()
        : generateUuid(),
    title,
    emoji: typeof obj.emoji === 'string' ? obj.emoji : undefined,
    themeColor: typeof obj.themeColor === 'string' ? obj.themeColor : undefined,
    links
  };
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

/**
 * Import Chrome/Netscape HTML bookmarks, replace current guest bookmarks store.
 */
export const importPublicBookmarksFromHtml = async (
  file: File
): Promise<{
  success: boolean;
  message: string;
  linkCount: number;
  categoryCount: number;
  duplicateCount: number;
}> => {
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

/** Re-run domain grouping from all current links (replaces categories). */
export const regeneratePublicBookmarksByDomain = (): PublicBookmarksData => {
  const current = getPublicBookmarks();
  const flat = current.categories.flatMap((cat) =>
    cat.links.map((link) => ({ title: link.title, url: link.url }))
  );
  const categories = buildPublicBookmarkCategoriesFromList(flat);
  const next = { categories, updatedAt: new Date().toISOString() };
  setPublicBookmarks(next);
  return next;
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
  const next = { categories, updatedAt: new Date().toISOString() };
  setPublicBookmarks(next);
  return next;
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
  const next = { categories, updatedAt: new Date().toISOString() };
  setPublicBookmarks(next);
  return next;
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
  const next = { categories, updatedAt: new Date().toISOString() };
  setPublicBookmarks(next);
  return next;
};

/** Delete an entire bookmark space (category) and its links. */
export const removePublicBookmarkCategory = (
  categoryId: string
): PublicBookmarksData => {
  const data = getPublicBookmarks();
  const categories = data.categories.filter((cat) => cat.id !== categoryId);
  const next = { categories, updatedAt: new Date().toISOString() };
  setPublicBookmarks(next);
  return next;
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
  data?: PublicBookmarksData
): string => {
  const source = data ?? getPublicBookmarks();
  const now = Math.floor(Date.now() / 1000);
  const folders = source.categories
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

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${now}" LAST_MODIFIED="${now}">LinkNest Your Bookmarks</H3>
    <DL><p>
${folders}
    </DL><p>
</DL><p>
`;
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
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linknest-bookmarks-${stamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
  const next = { categories, updatedAt: new Date().toISOString() };
  setPublicBookmarks(next);
  return next;
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
