/**
 * LinkNest Bookmark Sync — service worker (MV3).
 * Flatten (Sync) and upsert (OutSync) for this Chrome/Edge profile only.
 */
importScripts('branding.js');

const VERSION = EXTENSION_VERSION;
const ORIGIN_DENIED_MESSAGE =
  'This site is not on the organisation allowlist. Bookmark Sync only answers your LinkNest origin.';
const BOOKMARKS_UNAVAILABLE =
  'Bookmarks API unavailable. Reload this extension and confirm the “bookmarks” permission is granted.';
const MAX_PUSH_BOOKMARKS = 5000;
const TITLE_MAX = 300;
const FOLDER_MAX = 100;
const DEFAULT_ROOT_FOLDER = 'LinkNest';

function normalizeBookmarkUrl(url) {
  return String(url || '')
    .toLowerCase()
    .replace(/\/$/, '')
    .split('#')[0]
    .trim();
}

function sanitizeHttpUrl(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('http://') && !s.startsWith('https://')) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch (_err) {
    return '';
  }
}

function flattenBookmarks(nodes, out) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node) continue;
    const url = node.url ? String(node.url) : '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      out.push({
        title: (node.title && String(node.title).trim()) || url,
        url
      });
    }
    if (node.children && node.children.length) {
      flattenBookmarks(node.children, out);
    }
  }
}

function bookmarkCall(method, args) {
  return new Promise((resolve, reject) => {
    const fn = chrome.bookmarks[method];
    if (typeof fn !== 'function') {
      reject(new Error(BOOKMARKS_UNAVAILABLE));
      return;
    }
    fn.apply(chrome.bookmarks, args.concat([function (result) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Bookmarks API failed'));
        return;
      }
      resolve(result);
    }]));
  });
}

function bookmarksApiReady() {
  return !!(
    chrome.bookmarks &&
    typeof chrome.bookmarks.getTree === 'function' &&
    typeof chrome.bookmarks.create === 'function' &&
    typeof chrome.bookmarks.update === 'function'
  );
}

function readBookmarkTree() {
  return new Promise((resolve) => {
    if (!bookmarksApiReady()) {
      resolve({ success: false, error: BOOKMARKS_UNAVAILABLE });
      return;
    }
    chrome.bookmarks.getTree((tree) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message || 'Failed to read bookmarks'
        });
        return;
      }
      const bookmarks = [];
      flattenBookmarks(tree, bookmarks);
      resolve({ success: true, bookmarks, version: VERSION });
    });
  });
}

function indexBookmarksByFolderPath(otherNode, map) {
  function walk(nodes, pathTitles) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node) continue;
      const url = node.url ? String(node.url) : '';
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const urlKey = normalizeBookmarkUrl(url);
        if (!urlKey) continue;
        const pathKey = pathTitles.map((t) => String(t || '').toLowerCase()).join('\0');
        const mapKey = pathKey + '\n' + urlKey;
        if (!map.has(mapKey)) {
          map.set(mapKey, {
            id: node.id,
            title: (node.title && String(node.title).trim()) || url
          });
        }
      } else if (node.children && node.children.length) {
        const title = String(node.title || '').trim();
        walk(node.children, pathTitles.concat([title]));
      }
    }
  }
  walk((otherNode && otherNode.children) || [], []);
}

function destFolderPathKey(rootFolder, folder) {
  const parts = [String(rootFolder || DEFAULT_ROOT_FOLDER).trim() || DEFAULT_ROOT_FOLDER];
  String(folder || '')
    .split(/\s*›\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => parts.push(part));
  return parts.map((part) => part.toLowerCase()).join('\0');
}

function findOtherBookmarksNode(tree) {
  const root = Array.isArray(tree) && tree[0] ? tree[0] : null;
  const children = (root && root.children) || [];
  const byId = children.find((node) => node && node.id === '2');
  if (byId) return byId;
  const byTitle = children.find((node) => {
    if (!node || node.url) return false;
    const title = String(node.title || '').toLowerCase();
    return title === 'other bookmarks' || title.indexOf('other bookmark') !== -1;
  });
  if (byTitle) return byTitle;
  return children.find((node) => node && !node.url && node.id !== '1') || children[0] || root;
}

async function ensureFolder(parentId, title, cache) {
  const safeTitle = String(title || '').trim().slice(0, FOLDER_MAX) || DEFAULT_ROOT_FOLDER;
  const key = parentId + '\n' + safeTitle.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const children = await bookmarkCall('getChildren', [parentId]);
  const existing = (children || []).find(
    (node) =>
      node &&
      !node.url &&
      String(node.title || '').trim().toLowerCase() === safeTitle.toLowerCase()
  );
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const created = await bookmarkCall('create', [
    { parentId: parentId, title: safeTitle }
  ]);
  cache.set(key, created.id);
  return created.id;
}

/** Walk `Parent › Child` into nested Chrome folders. Other folder names stay one level. */
async function ensureFolderPath(rootId, folder, cache) {
  const raw = String(folder || '').trim();
  if (!raw) return rootId;
  const parts = raw
    .split(/\s*›\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  let id = rootId;
  for (let i = 0; i < parts.length; i++) {
    id = await ensureFolder(id, parts[i], cache);
  }
  return id;
}

function sanitizePushList(raw, rootFolderRaw) {
  const rootFolder =
    String(rootFolderRaw || DEFAULT_ROOT_FOLDER).trim().slice(0, FOLDER_MAX) ||
    DEFAULT_ROOT_FOLDER;
  const list = Array.isArray(raw) ? raw : [];
  const bookmarks = [];
  for (let i = 0; i < list.length && bookmarks.length < MAX_PUSH_BOOKMARKS; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') continue;
    const url = sanitizeHttpUrl(item.url);
    if (!url) continue;
    const title = String(item.title || '').trim().slice(0, TITLE_MAX) || url;
    const folder = String(item.folder || '').trim().slice(0, FOLDER_MAX);
    bookmarks.push({ title: title, url: url, folder: folder });
  }
  return { rootFolder: rootFolder, bookmarks: bookmarks };
}

async function pushBookmarks(payload) {
  if (!bookmarksApiReady()) {
    return { success: false, error: BOOKMARKS_UNAVAILABLE };
  }
  const dryRun = !!(payload && payload.dryRun);
  const sanitized = sanitizePushList(payload && payload.bookmarks, payload && payload.rootFolder);
  const tree = await bookmarkCall('getTree', []);
  const other = findOtherBookmarksNode(tree);
  if (!other || !other.id) {
    return { success: false, error: 'Could not find the Other Bookmarks folder in this profile.' };
  }
  const byPathUrl = new Map();
  indexBookmarksByFolderPath(other, byPathUrl);
  const folderCache = new Map();
  let rootId = '';
  if (!dryRun) {
    rootId = await ensureFolder(other.id, sanitized.rootFolder, folderCache);
  }
  let added = 0;
  let skipped = 0;
  let updated = 0;
  const seen = new Set();
  const changes = [];

  for (const item of sanitized.bookmarks) {
    const key = normalizeBookmarkUrl(item.url);
    if (!key) {
      skipped++;
      continue;
    }
    const pathKey = destFolderPathKey(sanitized.rootFolder, item.folder);
    const seenKey = pathKey + '\n' + key;
    if (seen.has(seenKey)) {
      skipped++;
      changes.push({
        action: 'skip',
        title: item.title,
        url: item.url,
        folder: item.folder,
        reason: 'duplicate-in-payload'
      });
      continue;
    }
    seen.add(seenKey);
    const existing = byPathUrl.get(seenKey);
    if (existing) {
      if (existing.title !== item.title && item.title && existing.id) {
        const previousTitle = existing.title;
        if (!dryRun) {
          try {
            await bookmarkCall('update', [existing.id, { title: item.title }]);
            existing.title = item.title;
          } catch (_err) {
            skipped++;
            changes.push({
              action: 'skip',
              title: item.title,
              url: item.url,
              folder: item.folder,
              previousTitle: previousTitle,
              reason: 'update-failed'
            });
            continue;
          }
        }
        updated++;
        changes.push({
          action: 'update',
          title: item.title,
          url: item.url,
          folder: item.folder,
          previousTitle: previousTitle,
          path: 'existing Chrome folder (not moved)'
        });
      } else {
        skipped++;
        changes.push({
          action: 'skip',
          title: item.title,
          url: item.url,
          folder: item.folder,
          previousTitle: existing.title,
          reason: 'already-exists'
        });
      }
      continue;
    }
    if (!dryRun) {
      const parentId = item.folder
        ? await ensureFolderPath(rootId, item.folder, folderCache)
        : rootId;
      try {
        const created = await bookmarkCall('create', [
          { parentId: parentId, title: item.title, url: item.url }
        ]);
        byPathUrl.set(seenKey, { id: created && created.id, title: item.title });
      } catch (_err) {
        skipped++;
        changes.push({
          action: 'skip',
          title: item.title,
          url: item.url,
          folder: item.folder,
          reason: 'create-failed'
        });
        continue;
      }
    }
    added++;
    const nestedFolder = String(item.folder || '')
      .split(/\s*›\s*/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' / ');
    const path = nestedFolder
      ? sanitized.rootFolder + ' / ' + nestedFolder
      : sanitized.rootFolder;
    changes.push({
      action: 'add',
      title: item.title,
      url: item.url,
      folder: item.folder,
      path: path
    });
  }

  return {
    success: true,
    added: added,
    skipped: skipped,
    updated: updated,
    changes: changes,
    dryRun: dryRun,
    rootFolder: sanitized.rootFolder,
    version: VERSION
  };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function serializeBookmarkNode(node) {
  if (!node) return null;
  const item = {
    title: String(node.title || ''),
    dateAdded: Number(node.dateAdded) || 0
  };
  if (node.url) item.url = String(node.url);
  if (Array.isArray(node.children) && node.children.length) {
    item.children = node.children.map(serializeBookmarkNode).filter(Boolean);
  }
  return item;
}

function nodeToNetscape(node, indent) {
  if (!node) return '';
  const pad = '    '.repeat(indent);
  const title = escapeHtml(node.title || '');
  const added = node.dateAdded
    ? Math.floor(Number(node.dateAdded) / 1000)
    : Math.floor(Date.now() / 1000);
  if (node.url) {
    const url = String(node.url);
    if (/^(javascript|data):/i.test(url)) return '';
    return (
      pad +
      '<DT><A HREF="' +
      escapeHtml(url) +
      '" ADD_DATE="' +
      added +
      '">' +
      title +
      '</A>\n'
    );
  }
  const toolbar = node.id === '1' ? ' PERSONAL_TOOLBAR_FOLDER="true"' : '';
  let html =
    pad +
    '<DT><H3 ADD_DATE="' +
    added +
    '"' +
    toolbar +
    '>' +
    title +
    '</H3>\n' +
    pad +
    '<DL><p>\n';
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    html += nodeToNetscape(kids[i], indent + 1);
  }
  html += pad + '</DL><p>\n';
  return html;
}

function treeToNetscapeHtml(tree) {
  const root = Array.isArray(tree) && tree[0] ? tree[0] : { children: [] };
  const kids = root.children || [];
  let body = '';
  for (let i = 0; i < kids.length; i++) {
    body += nodeToNetscape(kids[i], 1);
  }
  return (
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n' +
    '<!-- LinkNest Bookmark Sync backup of this Chrome/Edge profile.\n' +
    '     Import: Bookmarks → Bookmark manager → Import bookmarks.\n' +
    '     Chrome import merges; it does not delete newer bookmarks. -->\n' +
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
    '<TITLE>Bookmarks</TITLE>\n' +
    '<H1>Bookmarks</H1>\n' +
    '<DL><p>\n' +
    body +
    '</DL><p>\n'
  );
}

function countSerializedLinks(node) {
  if (!node) return 0;
  let n = node.url ? 1 : 0;
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) n += countSerializedLinks(kids[i]);
  return n;
}

async function exportBookmarkBackup() {
  if (!bookmarksApiReady()) {
    return { success: false, error: BOOKMARKS_UNAVAILABLE };
  }
  const tree = await bookmarkCall('getTree', []);
  const serialized = Array.isArray(tree) ? tree.map(serializeBookmarkNode).filter(Boolean) : [];
  const html = treeToNetscapeHtml(tree);
  let linkCount = 0;
  for (let i = 0; i < serialized.length; i++) {
    linkCount += countSerializedLinks(serialized[i]);
  }
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    html: html,
    tree: serialized,
    linkCount: linkCount,
    version: VERSION
  };
}

function isExtensionPageSender(sender) {
  if (!sender) return false;
  const url = String(sender.url || '');
  return url.indexOf(chrome.runtime.getURL('')) === 0;
}

function gateAndRun(sender, sendResponse, work, mode) {
  const origin = senderPageOrigin(sender);
  const isWrite = mode === 'write';
  const isAny = mode === 'any';
  Promise.all([isOriginAllowed(origin), getSyncModes()])
    .then(([allowed, modes]) => {
      if (!allowed) {
        sendResponse({ success: false, error: ORIGIN_DENIED_MESSAGE });
        return;
      }
      const enabled = isWrite ? modes.write : isAny ? modes.any : modes.read;
      if (!enabled) {
        sendResponse({
          success: false,
          error: isWrite
            ? SYNC_WRITE_DISABLED_MESSAGE
            : isAny
              ? 'Turn Read-only or Read-write On in the toolbar popup to back up bookmarks.'
              : SYNC_READ_DISABLED_MESSAGE
        });
        return;
      }
      const started = Date.now();
      return Promise.resolve()
        .then(work)
        .then((result) => {
          const ms = Math.max(0, Date.now() - started);
          const ok = !!(result && result.success);
          if (result && result.dryRun) {
            sendResponse(result);
            return;
          }
          return recordSync(ms, ok, isWrite ? 'write' : 'read').then(() => {
            if (result && typeof result === 'object') result.syncMs = ms;
            sendResponse(result);
          });
        });
    })
    .catch((err) => {
      sendResponse({
        success: false,
        error: (err && err.message) || 'Failed to sync bookmarks'
      });
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return;

  if (request.action === 'pageGate') {
    const origin = senderPageOrigin(sender);
    Promise.all([isOriginAllowed(origin), getSyncModes()]).then(([allowed, modes]) => {
      sendResponse({
        allowed: !!allowed,
        syncEnabled: !!(modes && modes.any),
        readEnabled: !!(modes && modes.read),
        writeEnabled: !!(modes && modes.write),
        origin: origin
      });
    });
    return true;
  }

  if (request.action === 'getSyncStats') {
    if (!isExtensionPageSender(sender)) {
      sendResponse({ read: { count: 0 }, write: { count: 0 } });
      return;
    }
    getSyncStats().then(sendResponse);
    return true;
  }

  if (request.action === 'isSyncEnabled') {
    getSyncModes().then((modes) =>
      sendResponse({
        enabled: !!(modes && modes.any),
        readEnabled: !!(modes && modes.read),
        writeEnabled: !!(modes && modes.write)
      })
    );
    return true;
  }

  if (request.action === 'getBookmarks') {
    gateAndRun(sender, sendResponse, () => readBookmarkTree(), 'read');
    return true;
  }

  if (request.action === 'exportBookmarkBackup') {
    gateAndRun(sender, sendResponse, () => exportBookmarkBackup(), 'any');
    return true;
  }

  if (request.action === 'previewPushBookmarks') {
    gateAndRun(sender, sendResponse, () => pushBookmarks({ ...request, dryRun: true }), 'write');
    return true;
  }

  if (request.action === 'pushBookmarks') {
    gateAndRun(sender, sendResponse, () => pushBookmarks(request), 'write');
    return true;
  }
});

function restoreBranding() {
  resolveBranding()
    .then((brand) => applyBranding(brand))
    .catch(() => {});
}

chrome.runtime.onInstalled.addListener(restoreBranding);
chrome.runtime.onStartup.addListener(restoreBranding);
restoreBranding();

function restoreSyncToggle() {
  migrateLegacySyncStats()
    .then(() => getSyncModes())
    .then((modes) => applySyncEnabledBadge(modes))
    .catch(() => {});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes.syncEnabled && !changes.syncReadEnabled && !changes.syncWriteEnabled) return;
  getSyncModes()
    .then((modes) => applySyncEnabledBadge(modes))
    .catch(() => {});
});

restoreSyncToggle();
