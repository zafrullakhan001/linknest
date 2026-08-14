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

export type BrowserExtensionBookmarksResult =
  | { ok: true; bookmarks: ImportedBookmark[] }
  | { ok: false; reason: 'timeout' | 'error' | 'empty'; message: string };

/** Map raw extension JS errors to a user-facing Sync message. */
export const friendlyExtensionBookmarkError = (raw?: string): string => {
  const msg = (raw || '').trim();
  const lower = msg.toLowerCase();
  if (
    !msg ||
    lower.includes('gettree') ||
    lower.includes('chrome.bookmarks') ||
    lower.includes("reading 'bookmarks'") ||
    lower.includes('bookmarks is undefined') ||
    lower.includes('bookmarks api')
  ) {
    return 'Browser extension cannot read bookmarks (needs the “bookmarks” permission). Install LinkNest Bookmark Sync (extensions/bookmark-sync) or update Browser Launcher Pro, or use Import HTML.';
  }
  if (
    lower.includes('context invalidated') ||
    lower.includes('extension was reloaded') ||
    lower.includes('refresh this page')
  ) {
    return 'Extension was reloaded. Refresh this page, then try Sync again.';
  }
  if (lower.includes('turned off') || lower.includes('enable bookmark sync')) {
    return 'Turn Bookmark sync On in the extension popup (it starts Off), then try Sync again — or use Import HTML.';
  }
  if (lower.includes('allowlist') || lower.includes('not allowed')) {
    return 'This site is not on the Bookmark Sync allowlist. Ask IT to add this origin to org-branding.json allowedOrigins — or use Import HTML.';
  }
  if (lower.includes('timeout') || lower.includes('not available') || lower.includes('install')) {
    return 'Install extension, turn Bookmark sync On, confirm this site is allowlisted, or use Import HTML.';
  }
  // Keep short unknown errors; otherwise fall back to the standard hint
  if (msg.length <= 120 && !lower.includes('undefined') && !lower.includes('null')) {
    return `${msg} — or use Import HTML.`;
  }
  return 'Install extension or use Import HTML.';
};

/** Same-window replies from our content script (reject other frames / origins). */
export const isTrustedPageExtensionMessage = (event: MessageEvent): boolean =>
  event.source === window && event.origin === window.location.origin;

/**
 * Ask LinkNest Bookmark Sync or Browser Launcher Pro (compatible postMessage
 * protocol) for the user's bookmarks. Resolves with bookmarks or a friendly failure.
 * Only accepts replies from this page origin.
 */
export const requestBookmarksFromBrowserExtension = (
  timeoutMs = 12000
): Promise<BrowserExtensionBookmarksResult> => {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    let settled = false;
    const targetOrigin = window.location.origin;

    const finish = (result: BrowserExtensionBookmarksResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (!isTrustedPageExtensionMessage(event)) return;
      const data = event.data;
      if (
        !data ||
        data.type !== 'BROWSER_LAUNCHER_BOOKMARKS_LIST' ||
        data.timestamp !== timestamp
      ) {
        return;
      }

      if (!data.success) {
        finish({
          ok: false,
          reason: 'error',
          message: friendlyExtensionBookmarkError(
            typeof data.error === 'string' ? data.error : undefined
          )
        });
        return;
      }

      const raw = Array.isArray(data.bookmarks) ? data.bookmarks : [];
      const bookmarks: ImportedBookmark[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) continue;
        const title =
          (typeof item.title === 'string' && item.title.trim()) ||
          (typeof item.label === 'string' && item.label.trim()) ||
          url;
        bookmarks.push({ title, url });
      }

      if (bookmarks.length === 0) {
        finish({
          ok: false,
          reason: 'empty',
          message:
            'No http(s) bookmarks returned by the extension. Install extension or use Import HTML.'
        });
        return;
      }

      finish({ ok: true, bookmarks });
    };

    const timer = window.setTimeout(() => {
      finish({
        ok: false,
        reason: 'timeout',
        message: 'Install extension, turn Bookmark sync On, confirm this site is allowlisted, or use Import HTML.'
      });
    }, timeoutMs);

    window.addEventListener('message', onMessage);
    window.postMessage(
      {
        type: 'BROWSER_LAUNCHER_GET_BOOKMARKS',
        timestamp
      },
      targetOrigin
    );
  });
};
