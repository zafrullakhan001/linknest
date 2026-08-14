/**
 * LinkNest Bookmark Sync — service worker (MV3).
 * Bookmark flatten for LinkNest / Fav Organizer, plus stored toolbar branding.
 * Bookmarks are read only from this Chrome/Edge profile (never another user or PC).
 */
importScripts('branding.js');

const VERSION = EXTENSION_VERSION;
const ORIGIN_DENIED_MESSAGE =
  'This site is not on the organisation allowlist. Bookmark Sync only answers your LinkNest origin.';

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

function readBookmarkTree() {
  return new Promise((resolve) => {
    if (!chrome.bookmarks || typeof chrome.bookmarks.getTree !== 'function') {
      resolve({
        success: false,
        error:
          'Bookmarks API unavailable. Reload this extension and confirm the “bookmarks” permission is granted.'
      });
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

function isExtensionPageSender(sender) {
  if (!sender) return false;
  const url = String(sender.url || '');
  return url.indexOf(chrome.runtime.getURL('')) === 0;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return;

  if (request.action === 'pageGate') {
    const origin = senderPageOrigin(sender);
    Promise.all([isOriginAllowed(origin), getSyncEnabled()]).then(([allowed, enabled]) => {
      sendResponse({ allowed: !!allowed, syncEnabled: !!enabled, origin: origin });
    });
    return true;
  }

  if (request.action === 'getSyncStats') {
    if (!isExtensionPageSender(sender)) {
      sendResponse({ count: 0 });
      return;
    }
    getSyncStats().then(sendResponse);
    return true;
  }

  if (request.action === 'isSyncEnabled') {
    getSyncEnabled().then((enabled) => sendResponse({ enabled: !!enabled }));
    return true;
  }

  if (request.action !== 'getBookmarks') return;

  const origin = senderPageOrigin(sender);
  Promise.all([isOriginAllowed(origin), getSyncEnabled()]).then(([allowed, enabled]) => {
    if (!allowed) {
      sendResponse({ success: false, error: ORIGIN_DENIED_MESSAGE });
      return;
    }
    if (!enabled) {
      sendResponse({ success: false, error: SYNC_DISABLED_MESSAGE });
      return;
    }
    const started = Date.now();
    return readBookmarkTree().then((result) => {
      const ms = Math.max(0, Date.now() - started);
      const ok = !!(result && result.success);
      return recordSync(ms, ok).then(() => {
        if (result && typeof result === 'object') result.syncMs = ms;
        sendResponse(result);
      });
    });
  });
  return true;
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
  getSyncEnabled()
    .then((on) => applySyncEnabledBadge(on))
    .catch(() => {});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.syncEnabled) return;
  applySyncEnabledBadge(changes.syncEnabled.newValue === true);
});

restoreSyncToggle();
