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
  if (lower.includes('read-write') || lower.includes('outsync is turned off')) {
    return 'Turn Read-write (OutSync) On in the extension popup, then try OutSync again.';
  }
  if (lower.includes('read-only') || lower.includes('turned off') || lower.includes('enable bookmark sync')) {
    return 'Turn Read-only (Sync) On in the extension popup (it starts Off), then try Sync again — or use Import HTML.';
  }
  if (lower.includes('allowlist') || lower.includes('not allowed')) {
    return 'This site is not on the Bookmark Sync allowlist. Ask IT to add this origin to org-branding.json allowedOrigins — or use Import HTML.';
  }
  if (lower.includes('timeout') || lower.includes('not available') || lower.includes('install')) {
    return 'Install extension, turn Read-only (Sync) On, confirm this site is allowlisted, or use Import HTML.';
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

export type BrowserExtensionPresence = {
  available: boolean;
  canSync: boolean;
  canOutSync: boolean;
  supportsOutSync: boolean;
  readEnabled: boolean;
  writeEnabled: boolean;
  name: string;
  version: string;
};

const emptyExtensionPresence = (): BrowserExtensionPresence => ({
  available: false,
  canSync: false,
  canOutSync: false,
  supportsOutSync: false,
  readEnabled: false,
  writeEnabled: false,
  name: '',
  version: ''
});

const extensionFeatureList = (data: Record<string, unknown>): string[] =>
  Array.isArray(data.features) ? data.features.map((f) => String(f)) : [];

const isBookmarkSyncCheckReply = (data: Record<string, unknown>): boolean => {
  const feats = extensionFeatureList(data);
  const name = String(data.name || '');
  return (
    feats.includes('bookmarks') ||
    feats.includes('bookmarksWrite') ||
    /bookmark sync/i.test(name)
  );
};

const isLauncherProCheckReply = (data: Record<string, unknown>): boolean => {
  const feats = extensionFeatureList(data);
  const name = String(data.name || '');
  if (/launcher\s*pro/i.test(name)) return true;
  return (
    feats.includes('launch') ||
    feats.includes('open') ||
    feats.includes('browsers')
  );
};

export type DetectedBrowserExtension = {
  kind: 'bookmark-sync' | 'launcher-pro' | 'other';
  name: string;
  version: string;
  features: string[];
  readEnabled: boolean;
  writeEnabled: boolean;
};

const classifyExtensionReply = (data: Record<string, unknown>): DetectedBrowserExtension[] => {
  const feats = extensionFeatureList(data);
  const version = typeof data.version === 'string' ? data.version : '';
  const name = typeof data.name === 'string' ? data.name : '';
  const readEnabled = !!data.readEnabled;
  const writeEnabled = !!data.writeEnabled;
  const sync = isBookmarkSyncCheckReply(data);
  const pro =
    isLauncherProCheckReply(data) ||
    /^3(\.|$)/.test(version) ||
    /launcher/i.test(name);
  const out: DetectedBrowserExtension[] = [];
  if (pro) {
    out.push({
      kind: 'launcher-pro',
      name: /launcher/i.test(name) ? name : 'Browser Launcher Pro',
      version: version || 'installed',
      features: feats,
      readEnabled,
      writeEnabled,
    });
  }
  if (sync) {
    out.push({
      kind: 'bookmark-sync',
      name: name || 'LinkNest Bookmark Sync',
      version,
      features: feats,
      readEnabled,
      writeEnabled,
    });
  }
  if (out.length === 0 && data.available !== false) {
    out.push({
      kind: 'launcher-pro',
      name: name || 'Browser Launcher Pro',
      version: version || 'installed',
      features: feats,
      readEnabled,
      writeEnabled,
    });
  }
  return out;
};

const buildDetectedList = (
  replies: Array<Record<string, unknown>>,
  browsersOk: boolean,
  browsersVersion: string
): DetectedBrowserExtension[] => {
  const live = replies.filter((row) => row && row.available !== false);
  const unique: DetectedBrowserExtension[] = [];
  const seen = new Set<string>();
  const add = (ext: DetectedBrowserExtension) => {
    const key = `${ext.kind}:${ext.name}:${ext.version}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(ext);
  };
  for (const row of live) {
    classifyExtensionReply(row).forEach(add);
  }
  if (browsersOk && unique.every((e) => e.kind !== 'launcher-pro')) {
    const checkVer = live.find((r) => typeof r.version === 'string' && /^3/.test(String(r.version)));
    add({
      kind: 'launcher-pro',
      name: 'Browser Launcher Pro',
      version:
        browsersVersion ||
        (typeof checkVer?.version === 'string' ? checkVer.version : '') ||
        '3.x',
      features: ['browsers'],
      readEnabled: false,
      writeEnabled: false,
    });
  }
  if (
    unique.every((e) => e.kind !== 'launcher-pro') &&
    typeof window !== 'undefined' &&
    (window as unknown as { BrowserLauncherProExtension?: { version?: string } }).BrowserLauncherProExtension
  ) {
    const marker = (window as unknown as { BrowserLauncherProExtension: { version?: string } }).BrowserLauncherProExtension;
    add({
      kind: 'launcher-pro',
      name: 'Browser Launcher Pro',
      version: marker.version || 'detected',
      features: [],
      readEnabled: false,
      writeEnabled: false,
    });
  }
  return unique;
};

/** List Bookmark Sync and Browser Launcher Pro if they answer CHECK (both can be installed). */
export const listDetectedBrowserExtensions = (
  timeoutMs = 1800,
  opts?: { resolveOnFirstReply?: boolean }
): Promise<DetectedBrowserExtension[]> => {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const replies: Array<Record<string, unknown>> = [];
    let browsersOk = false;
    let browsersVersion = '';
    let settled = false;
    let earlyTimer: number | null = null;
    let maxTimer = 0;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (earlyTimer != null) window.clearTimeout(earlyTimer);
      window.clearTimeout(maxTimer);
      window.removeEventListener('message', onMessage);
      resolve(buildDetectedList(replies, browsersOk, browsersVersion));
    };

    const onMessage = (event: MessageEvent) => {
      if (!isTrustedPageExtensionMessage(event)) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'BROWSER_LAUNCHER_CHECK_RESPONSE') {
        if (data.timestamp !== timestamp && data.timestamp != null) return;
        replies.push(data);
        if (opts?.resolveOnFirstReply && earlyTimer == null) {
          earlyTimer = window.setTimeout(finish, 80);
        }
      }
      if (data.type === 'BROWSER_LAUNCHER_BROWSERS_LIST') {
        if (data.timestamp !== timestamp && data.timestamp != null) return;
        if (data.success !== false) {
          browsersOk = true;
          if (typeof data.version === 'string' && data.version) browsersVersion = data.version;
        }
      }
    };
    window.addEventListener('message', onMessage);
    const origin = window.location.origin;
    const ping = (target: string) => {
      window.postMessage({ type: 'BROWSER_LAUNCHER_CHECK', timestamp }, target);
      window.postMessage({ type: 'BROWSER_LAUNCHER_GET_BROWSERS', timestamp }, target);
    };
    ping(origin);
    if (origin !== '*') ping('*');
    maxTimer = window.setTimeout(finish, Math.max(50, timeoutMs));
  });
};

const mergeExtensionCheckReplies = (
  replies: Array<Record<string, unknown>>
): BrowserExtensionPresence => {
  const live = replies.filter((row) => row && row.available);
  if (live.length === 0) return emptyExtensionPresence();
  const syncReply = live.find((row) => isBookmarkSyncCheckReply(row));
  if (syncReply) {
    const feats = extensionFeatureList(syncReply);
    const readEnabled = !!syncReply.readEnabled;
    const writeEnabled = !!syncReply.writeEnabled;
    const supportsOutSync = feats.includes('bookmarksWrite');
    return {
      available: true,
      canSync: readEnabled,
      canOutSync: writeEnabled && supportsOutSync,
      supportsOutSync,
      readEnabled,
      writeEnabled,
      name: (typeof syncReply.name === 'string' && syncReply.name) || 'LinkNest Bookmark Sync',
      version: typeof syncReply.version === 'string' ? syncReply.version : ''
    };
  }
  const other = live[0];
  return {
    available: true,
    canSync: true,
    canOutSync: false,
    supportsOutSync: false,
    readEnabled: true,
    writeEnabled: false,
    name:
      (typeof other.name === 'string' && other.name) || 'Browser Launcher Pro',
    version: typeof other.version === 'string' ? other.version : ''
  };
};

/** Ping Bookmark Sync / Browser Launcher Pro. Collects replies so both can be installed. */
export const probeBrowserBookmarkExtension = (
  timeoutMs = 1200
): Promise<BrowserExtensionPresence> => {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    const replies: Array<Record<string, unknown>> = [];
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedPageExtensionMessage(event)) return;
      const data = event.data;
      if (
        !data ||
        data.type !== 'BROWSER_LAUNCHER_CHECK_RESPONSE' ||
        data.timestamp !== timestamp
      ) {
        return;
      }
      replies.push(data);
    };
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'BROWSER_LAUNCHER_CHECK', timestamp }, window.location.origin);
    window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(mergeExtensionCheckReplies(replies));
    }, timeoutMs);
  });
};

export const sameExtensionPresence = (
  a: BrowserExtensionPresence | null,
  b: BrowserExtensionPresence
): boolean =>
  !!a &&
  a.available === b.available &&
  a.canSync === b.canSync &&
  a.canOutSync === b.canOutSync &&
  a.supportsOutSync === b.supportsOutSync &&
  a.readEnabled === b.readEnabled &&
  a.writeEnabled === b.writeEnabled;

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
        message: 'Install extension, turn Read-only (Sync) On, confirm this site is allowlisted, or use Import HTML.'
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

export interface OutSyncBookmark {
  title: string;
  url: string;
  folder: string;
}

export type OutSyncChangeAction = 'add' | 'update' | 'skip';

export interface OutSyncChange {
  action: OutSyncChangeAction;
  title: string;
  url: string;
  folder?: string;
  previousTitle?: string;
  path?: string;
  reason?: string;
}

export interface OutSyncChangelog {
  generatedAt: string;
  rootFolder: string;
  dryRun: boolean;
  added: number;
  updated: number;
  skipped: number;
  changes: OutSyncChange[];
}

export type BrowserExtensionPushResult =
  | {
      ok: true;
      added: number;
      skipped: number;
      updated: number;
      changes: OutSyncChange[];
      dryRun: boolean;
      rootFolder: string;
    }
  | { ok: false; reason: 'timeout' | 'error' | 'empty'; message: string };

const OUTSYNC_TIMEOUT_MESSAGE =
  'Reload Bookmark Sync 1.8.1+ (chrome://extensions → Reload), refresh this page, turn Read-write (OutSync) On, then try OutSync again.';

export const flattenPublicBookmarksForOutSync = (
  data: {
    categories?: Array<{
      id?: string;
      title?: string;
      parentId?: string;
      links?: Array<{ title?: string; url?: string }>;
    }>;
  } | null
): OutSyncBookmark[] => {
  const categories = data && Array.isArray(data.categories) ? data.categories : [];
  const byId = new Map<string, (typeof categories)[number]>();
  categories.forEach((category) => {
    if (typeof category?.id === 'string' && category.id.trim()) {
      byId.set(category.id, category);
    }
  });
  const folderPath = (category: (typeof categories)[number]): string => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let current: (typeof categories)[number] | undefined = category;
    while (current) {
      if (current.id && seen.has(current.id)) break;
      if (current.id) seen.add(current.id);
      const title = typeof current.title === 'string' ? current.title.trim() : '';
      if (title) parts.unshift(title);
      const parentId =
        typeof current.parentId === 'string' && current.parentId.trim()
          ? current.parentId.trim()
          : '';
      current = parentId ? byId.get(parentId) : undefined;
    }
    return parts.join(' › ') || 'Bookmarks';
  };
  const seen = new Set<string>();
  const out: OutSyncBookmark[] = [];
  for (const category of categories) {
    const folder = folderPath(category);
    const links = Array.isArray(category?.links) ? category.links : [];
    for (const link of links) {
      const url = typeof link?.url === 'string' ? link.url.trim() : '';
      if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) continue;
      const urlKey = normalizeBookmarkUrl(url);
      if (!urlKey) continue;
      const dedupeKey = `${folder.toLowerCase()}\n${urlKey}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const title =
        (typeof link?.title === 'string' && link.title.trim()) || url;
      out.push({ title, url, folder });
    }
  }
  return out;
};

export const friendlyExtensionOutSyncError = (raw?: string): string => {
  const msg = (raw || '').trim();
  const lower = msg.toLowerCase();
  if (
    lower.includes('context invalidated') ||
    lower.includes('extension was reloaded') ||
    lower.includes('refresh this page')
  ) {
    return 'Extension was reloaded. Refresh this page, then try OutSync again.';
  }
  if (lower.includes('read-only')) {
    return 'Read-only Sync is off. OutSync still needs Read-write On in the extension popup.';
  }
  if (
    lower.includes('turned off') ||
    lower.includes('enable bookmark sync') ||
    lower.includes('read-write')
  ) {
    return 'Turn Read-write (OutSync) On in the extension popup (it starts Off), then try OutSync again.';
  }
  if (lower.includes('allowlist') || lower.includes('not allowed')) {
    return 'This site is not on the Bookmark Sync allowlist. Ask IT to add this origin to org-branding.json allowedOrigins.';
  }
  if (
    !msg ||
    lower.includes('gettree') ||
    lower.includes('chrome.bookmarks') ||
    lower.includes("reading 'bookmarks'") ||
    lower.includes('bookmarks is undefined') ||
    lower.includes('bookmarks api')
  ) {
    return 'Browser extension cannot write bookmarks (needs the “bookmarks” permission). Reload LinkNest Bookmark Sync 1.8.1+.';
  }
  if (lower.includes('timeout') || lower.includes('not available') || lower.includes('install')) {
    return OUTSYNC_TIMEOUT_MESSAGE;
  }
  if (msg.length <= 120 && !lower.includes('undefined') && !lower.includes('null')) {
    return `${msg} — reload Bookmark Sync 1.8.1+ if OutSync preview is missing.`;
  }
  return OUTSYNC_TIMEOUT_MESSAGE;
};

const parseOutSyncChanges = (raw: unknown): OutSyncChange[] => {
  if (!Array.isArray(raw)) return [];
  const out: OutSyncChange[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const action = row.action;
    if (action !== 'add' && action !== 'update' && action !== 'skip') continue;
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!url) continue;
    const title = (typeof row.title === 'string' && row.title.trim()) || url;
    const change: OutSyncChange = { action, title, url };
    if (typeof row.folder === 'string' && row.folder.trim()) change.folder = row.folder.trim();
    if (typeof row.previousTitle === 'string' && row.previousTitle.trim()) {
      change.previousTitle = row.previousTitle.trim();
    }
    if (typeof row.path === 'string' && row.path.trim()) change.path = row.path.trim();
    if (typeof row.reason === 'string' && row.reason.trim()) change.reason = row.reason.trim();
    out.push(change);
  }
  return out;
};

export const downloadOutSyncChangelogJson = (
  changelog: OutSyncChangelog,
  filename?: string
): string => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const name = filename || `linknest-outsync-changelog-${stamp}.json`;
  const blob = new Blob([JSON.stringify(changelog, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  const changing = changelog.added + changelog.updated;
  return `Downloaded OutSync changelog (${changing} change${changing === 1 ? '' : 's'}, ${changelog.skipped} unchanged).`;
};

/**
 * Push Your Bookmarks into this Chrome/Edge profile via Bookmark Sync 1.8.1+.
 * Pass dryRun: true to preview without writing (older extensions time out instead of writing).
 */
export const requestPushBookmarksToBrowserExtension = (
  bookmarks: OutSyncBookmark[],
  opts?: { timeoutMs?: number; rootFolder?: string; dryRun?: boolean }
): Promise<BrowserExtensionPushResult> => {
  const payload = Array.isArray(bookmarks) ? bookmarks : [];
  if (payload.length === 0) {
    return Promise.resolve({
      ok: false,
      reason: 'empty',
      message: 'No http(s) bookmarks to push.'
    });
  }

  const timeoutMs = opts?.timeoutMs ?? 60000;
  const rootFolder = (opts?.rootFolder && opts.rootFolder.trim()) || 'LinkNest';
  const dryRun = !!opts?.dryRun;
  const requestType = dryRun
    ? 'BROWSER_LAUNCHER_PREVIEW_PUSH_BOOKMARKS'
    : 'BROWSER_LAUNCHER_PUSH_BOOKMARKS';

  return new Promise((resolve) => {
    const timestamp = Date.now();
    let settled = false;
    const targetOrigin = window.location.origin;

    const finish = (result: BrowserExtensionPushResult) => {
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
        data.type !== 'BROWSER_LAUNCHER_PUSH_BOOKMARKS_RESULT' ||
        data.timestamp !== timestamp
      ) {
        return;
      }

      if (!data.success) {
        finish({
          ok: false,
          reason: 'error',
          message: friendlyExtensionOutSyncError(
            typeof data.error === 'string' ? data.error : undefined
          )
        });
        return;
      }

      finish({
        ok: true,
        added: Math.max(0, Number(data.added) || 0),
        skipped: Math.max(0, Number(data.skipped) || 0),
        updated: Math.max(0, Number(data.updated) || 0),
        changes: parseOutSyncChanges(data.changes),
        dryRun: !!data.dryRun,
        rootFolder:
          (typeof data.rootFolder === 'string' && data.rootFolder.trim()) || rootFolder
      });
    };

    const timer = window.setTimeout(() => {
      finish({
        ok: false,
        reason: 'timeout',
        message: dryRun
          ? 'Reload Bookmark Sync 1.8.1+ for OutSync preview (chrome://extensions → Reload), refresh this page, turn Read-write On, then try again.'
          : OUTSYNC_TIMEOUT_MESSAGE
      });
    }, timeoutMs);

    window.addEventListener('message', onMessage);
    window.postMessage(
      {
        type: requestType,
        timestamp,
        rootFolder,
        bookmarks: payload,
        dryRun
      },
      targetOrigin
    );
  });
};

export type BrowserBookmarkBackupResult =
  | {
      ok: true;
      html: string;
      tree: unknown[];
      linkCount: number;
      generatedAt: string;
    }
  | { ok: false; reason: 'timeout' | 'error' | 'empty'; message: string };

const triggerNamedDownload = (contents: string, filename: string, mime: string): void => {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const waitMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

export const downloadBrowserBookmarkBackup = async (
  backup: Extract<BrowserBookmarkBackupResult, { ok: true }>
): Promise<string> => {
  const stamp = (backup.generatedAt || new Date().toISOString())
    .slice(0, 19)
    .replace(/[:T]/g, '-');
  const base = `linknest-browser-bookmarks-backup-${stamp}`;
  triggerNamedDownload(backup.html, `${base}.html`, 'text/html;charset=utf-8');
  await waitMs(400);
  triggerNamedDownload(
    JSON.stringify(
      {
        generatedAt: backup.generatedAt || new Date().toISOString(),
        kind: 'linknest-browser-bookmark-backup',
        linkCount: backup.linkCount,
        restore:
          'Chrome → Bookmarks → Bookmark manager → Import bookmarks, choose the .html file. Import merges; it does not delete newer bookmarks. OutSync adds live under Other Bookmarks → LinkNest — delete that folder to drop new links. Title updates can be restored from the OutSync changelog JSON (previousTitle).',
        tree: backup.tree
      },
      null,
      2
    ),
    `${base}.json`,
    'application/json;charset=utf-8'
  );
  return `Saved to this PC’s Downloads folder: ${base}.html and ${base}.json (${backup.linkCount} link${
    backup.linkCount === 1 ? '' : 's'
  }). Check Chrome’s download bar. Import the HTML in Bookmark manager to merge the saved tree. Delete Other Bookmarks → LinkNest to drop OutSync adds.`;
};

export const requestBrowserBookmarkBackup = (
  timeoutMs = 20000
): Promise<BrowserBookmarkBackupResult> => {
  return new Promise((resolve) => {
    const timestamp = Date.now();
    let settled = false;
    const targetOrigin = window.location.origin;

    const finish = (result: BrowserBookmarkBackupResult) => {
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
        data.type !== 'BROWSER_LAUNCHER_BOOKMARKS_BACKUP' ||
        data.timestamp !== timestamp
      ) {
        return;
      }
      if (!data.success) {
        finish({
          ok: false,
          reason: 'error',
          message: friendlyExtensionOutSyncError(
            typeof data.error === 'string' ? data.error : undefined
          )
        });
        return;
      }
      const html = typeof data.html === 'string' ? data.html : '';
      if (!html.trim()) {
        finish({
          ok: false,
          reason: 'empty',
          message: 'Backup was empty. Reload Bookmark Sync 1.8.2+ and try again.'
        });
        return;
      }
      finish({
        ok: true,
        html,
        tree: Array.isArray(data.tree) ? data.tree : [],
        linkCount: Math.max(0, Number(data.linkCount) || 0),
        generatedAt:
          (typeof data.generatedAt === 'string' && data.generatedAt) ||
          new Date().toISOString()
      });
    };

    const timer = window.setTimeout(() => {
      finish({
        ok: false,
        reason: 'timeout',
        message:
          'Reload Bookmark Sync 1.8.2+ for bookmark backup (chrome://extensions → Reload), refresh this page, turn Read-only or Read-write On, then try again.'
      });
    }, timeoutMs);

    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'BROWSER_LAUNCHER_BACKUP_BOOKMARKS', timestamp }, targetOrigin);
  });
};
