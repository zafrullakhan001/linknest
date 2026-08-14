/**
 * Shared helpers for Chrome/Netscape HTML bookmark import and domain grouping.
 * Used by Fav Organizer (auth) and guest Your Bookmarks (localStorage).
 */

export interface ImportedBookmark {
  title: string;
  url: string;
}

export interface DomainBookmarkGroup {
  domainKey: string;
  title: string;
  description: string;
  emoji: string;
  themeColor: string;
  links: ImportedBookmark[];
}

const DOMAIN_EMOJIS = [
  '💻', '🌐', '📚', '🛠️', '🎨', '🚀', '📱', '☁️', '🔐', '💰',
  '📊', '🎮', '🎵', '📷', '✈️', '🛒', '🏥', '🎓', '📝', '💡'
];

const DOMAIN_COLORS = [
  'blue', 'emerald', 'violet', 'amber', 'rose', 'cyan', 'fuchsia', 'orange',
  'indigo', 'lime', 'sky', 'slate', 'teal', 'pink', 'purple', 'yellow',
  'zinc', 'red', 'green', 'gray'
];

/** Normalize URL for dedupe: lowercase, no trailing slash, no fragment. */
export const normalizeBookmarkUrl = (url: string): string =>
  url
    .toLowerCase()
    .replace(/\/$/, '')
    .split('#')[0]
    .trim();

/**
 * Deduplicate bookmarks by normalized URL.
 * When duplicates exist, keep the entry with the more descriptive title.
 */
export const deduplicateBookmarks = (
  bookmarks: ImportedBookmark[]
): { unique: ImportedBookmark[]; duplicateCount: number } => {
  const seenUrls = new Map<string, ImportedBookmark>();
  const unique: ImportedBookmark[] = [];
  let duplicates = 0;

  for (const bookmark of bookmarks) {
    const normalizedUrl = normalizeBookmarkUrl(bookmark.url);

    if (!seenUrls.has(normalizedUrl)) {
      seenUrls.set(normalizedUrl, bookmark);
      unique.push(bookmark);
    } else {
      duplicates++;
      const existing = seenUrls.get(normalizedUrl)!;
      if (bookmark.title.length > existing.title.length && bookmark.title !== bookmark.url) {
        const index = unique.findIndex((b) => normalizeBookmarkUrl(b.url) === normalizedUrl);
        if (index !== -1) {
          unique[index] = bookmark;
          seenUrls.set(normalizedUrl, bookmark);
        }
      }
    }
  }

  return { unique, duplicateCount: duplicates };
};

/**
 * Parse Netscape / Chrome / Edge / Firefox bookmark HTML export.
 * Only http(s) anchors are kept; folder hierarchy is ignored.
 */
export const parseHTMLBookmarks = (htmlContent: string): ImportedBookmark[] => {
  const bookmarksList: ImportedBookmark[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');
  const links = doc.querySelectorAll('a');

  links.forEach((link) => {
    const href = link.getAttribute('href');
    const title = link.textContent?.trim() || href || '';

    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      bookmarksList.push({
        title: title || href,
        url: href
      });
    }
  });

  return bookmarksList;
};

/** Base domain for grouping (mail.google.com → google.com). */
export const getBookmarkBaseDomain = (url: string): string => {
  try {
    const hostname = new URL(url).hostname.replace('www.', '').replace(/^\.+/, '');
    return hostname.split('.').slice(-2).join('.') || 'misc';
  } catch {
    return 'misc';
  }
};

/**
 * Group bookmarks by base domain (same logic as Fav Organizer auto-organize).
 */
export const groupBookmarksByDomain = (bookmarkList: ImportedBookmark[]): DomainBookmarkGroup[] => {
  if (bookmarkList.length === 0) return [];

  const domainMap = new Map<string, ImportedBookmark[]>();

  bookmarkList.forEach((bookmark) => {
    const baseDomain = getBookmarkBaseDomain(bookmark.url);
    if (!domainMap.has(baseDomain)) {
      domainMap.set(baseDomain, []);
    }
    domainMap.get(baseDomain)!.push(bookmark);
  });

  const generated = Array.from(domainMap.entries()).map(([domain, links], index) => {
    const domainName =
      domain === 'misc' ? 'Miscellaneous' : domain.charAt(0).toUpperCase() + domain.slice(1);
    return {
      domainKey: domain,
      title: domainName,
      description: `${links.length} link${links.length !== 1 ? 's' : ''} from ${domain}`,
      emoji: DOMAIN_EMOJIS[index % DOMAIN_EMOJIS.length],
      themeColor: DOMAIN_COLORS[index % DOMAIN_COLORS.length],
      links
    };
  });

  generated.sort((a, b) => {
    if (a.title === 'Miscellaneous') return 1;
    if (b.title === 'Miscellaneous') return -1;
    return a.title.localeCompare(b.title);
  });

  return generated;
};
