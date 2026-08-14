/**
 * LinkNest Bookmark Sync — service worker (MV3).
 * Bookmark flatten for LinkNest / Fav Organizer, plus stored toolbar branding.
 */
importScripts('branding.js');

const VERSION = '1.1.0';

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

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || request.action !== 'getBookmarks') return;
  readBookmarkTree().then(sendResponse);
  return true;
});

function restoreBranding() {
  getStoredBranding()
    .then((brand) => applyBranding(brand))
    .catch(() => {});
}

chrome.runtime.onInstalled.addListener(restoreBranding);
chrome.runtime.onStartup.addListener(restoreBranding);
restoreBranding();
