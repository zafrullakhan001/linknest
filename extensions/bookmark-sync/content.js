/**
 * Page bridge for LinkNest Bookmark Sync.
 * Speaks the same postMessage protocol as Browser Launcher Pro, bookmarks only,
 * plus LinkNest OutSync (PUSH_BOOKMARKS). Pro 3.1+ implements OutSync as well.
 * Only allowlisted origins receive replies; postMessage uses this page's origin (not *).
 */
(function () {
  const VERSION = '1.8.6';
  const FEATURES = ['bookmarks', 'bookmarksWrite', 'bookmarksPreview', 'bookmarksBackup', 'incognito', 'newWindow'];
  const RELOAD_MSG =
    'Extension was reloaded. Refresh this page, then try Sync or OutSync again.';
  const MAX_PUSH_BOOKMARKS = 5000;
  const TITLE_MAX = 300;
  const FOLDER_MAX = 100;
  const DEFAULT_ROOT_FOLDER = 'LinkNest';
  const OPEN_INCOGNITO_HINT =
    'Enable “Allow in Incognito” for LinkNest Bookmark Sync in chrome://extensions (or edge://extensions), then try again.';

  try {
    window.LinkNestBookmarkSyncExtension = {
      available: true,
      version: VERSION,
      features: FEATURES
    };
  } catch (_err) {
    /* ignore */
  }

  function isContextValid() {
    try {
      return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
    } catch (_err) {
      return false;
    }
  }

  function pageOrigin() {
    try {
      return window.location.origin;
    } catch (_err) {
      return '';
    }
  }

  function post(payload) {
    const target = pageOrigin();
    if (!target) return;
    try {
      window.postMessage(payload, target);
    } catch (_err) {
      /* page may be tearing down */
    }
  }

  function replyOpen(timestamp, success, error, message) {
    post({
      type: 'BROWSER_LAUNCHER_RESPONSE',
      success: !!success,
      error: error || undefined,
      message: message || undefined,
      timestamp: timestamp,
      version: VERSION,
      features: FEATURES
    });
  }

  function failBookmarks(timestamp, error) {
    post({
      type: 'BROWSER_LAUNCHER_BOOKMARKS_LIST',
      bookmarks: [],
      error: error || 'Failed to fetch bookmarks',
      timestamp: timestamp,
      success: false,
      version: VERSION,
      features: FEATURES
    });
  }

  function failBackup(timestamp, error) {
    post({
      type: 'BROWSER_LAUNCHER_BOOKMARKS_BACKUP',
      html: '',
      tree: [],
      linkCount: 0,
      error: error || 'Failed to back up bookmarks',
      timestamp: timestamp,
      success: false,
      version: VERSION,
      features: FEATURES
    });
  }

  function failPush(timestamp, error) {
    post({
      type: 'BROWSER_LAUNCHER_PUSH_BOOKMARKS_RESULT',
      added: 0,
      skipped: 0,
      updated: 0,
      error: error || 'Failed to push bookmarks',
      timestamp: timestamp,
      success: false,
      version: VERSION,
      features: FEATURES
    });
  }

  function sanitizePushPayload(data) {
    const rootFolder =
      String((data && data.rootFolder) || DEFAULT_ROOT_FOLDER).trim().slice(0, FOLDER_MAX) ||
      DEFAULT_ROOT_FOLDER;
    const raw = data && Array.isArray(data.bookmarks) ? data.bookmarks : [];
    const bookmarks = [];
    for (let i = 0; i < raw.length && bookmarks.length < MAX_PUSH_BOOKMARKS; i++) {
      const item = raw[i];
      if (!item || typeof item !== 'object') continue;
      const url = String(item.url || '').trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      } catch (_err) {
        continue;
      }
      const title = String(item.title || '').trim().slice(0, TITLE_MAX) || url;
      const folder = String(item.folder || '').trim().slice(0, FOLDER_MAX);
      bookmarks.push({ title: title, url: url, folder: folder });
    }
    return { rootFolder: rootFolder, bookmarks: bookmarks };
  }

  function withPageGate(callback) {
    if (!isContextValid()) {
      callback(null);
      return;
    }
    try {
      chrome.runtime.sendMessage({ action: 'pageGate' }, function (response) {
        if (!isContextValid()) {
          callback(null);
          return;
        }
        try {
          if (chrome.runtime.lastError) {
            callback(null);
            return;
          }
          callback(response && typeof response === 'object' ? response : null);
        } catch (_err) {
          callback(null);
        }
      });
    } catch (_err) {
      callback(null);
    }
  }

  function runtimeErrorMessage() {
    const err = (chrome.runtime.lastError && chrome.runtime.lastError.message) || '';
    return /context invalidated/i.test(err) ? RELOAD_MSG : err || RELOAD_MSG;
  }

  window.addEventListener('message', function (event) {
    try {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;
      if (event.origin !== pageOrigin()) return;

      const type = event.data.type;
      const timestamp = event.data.timestamp;

      if (
        type !== 'BROWSER_LAUNCHER_CHECK' &&
        type !== 'BROWSER_LAUNCHER_OPEN' &&
        type !== 'BROWSER_LAUNCHER_GET_BOOKMARKS' &&
        type !== 'BROWSER_LAUNCHER_PUSH_BOOKMARKS' &&
        type !== 'BROWSER_LAUNCHER_PREVIEW_PUSH_BOOKMARKS' &&
        type !== 'BROWSER_LAUNCHER_BACKUP_BOOKMARKS'
      ) {
        return;
      }

      withPageGate(function (gate) {
        // Unknown sites and dead extension context: do not reply (no fingerprint).
        if (!gate || !gate.allowed) return;

        if (type === 'BROWSER_LAUNCHER_CHECK') {
          post({
            type: 'BROWSER_LAUNCHER_CHECK_RESPONSE',
            available: true,
            version: VERSION,
            name: 'LinkNest Bookmark Sync',
            features: FEATURES,
            syncEnabled: !!(gate.readEnabled || gate.writeEnabled || gate.syncEnabled),
            readEnabled: !!gate.readEnabled,
            writeEnabled: !!gate.writeEnabled,
            timestamp: timestamp
          });
          return;
        }

        if (type === 'BROWSER_LAUNCHER_OPEN') {
          const options = event.data.options || {};
          const inPrivate = !!(options.inPrivate || options.incognito || options.private);
          const newWindow = !!(options.newWindow || options.fullWindow || options.windowType === 'normal');
          const rawUrl = String(event.data.url || '').trim();
          let absUrl = rawUrl;
          try {
            absUrl = new URL(rawUrl, pageOrigin() || undefined).href;
          } catch (_err) {
            /* keep rawUrl */
          }
          if (!inPrivate && !newWindow) {
            replyOpen(
              timestamp,
              false,
              'LinkNest Bookmark Sync opens links in Incognito / InPrivate or a full browser window only. Install Browser Launcher Pro to open in other browsers.'
            );
            return;
          }
          if (!isContextValid()) {
            replyOpen(timestamp, false, RELOAD_MSG);
            return;
          }
          try {
            const parsed = new URL(absUrl);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              replyOpen(timestamp, false, 'Only http(s) URLs can open this way');
              return;
            }
            absUrl = parsed.href;
          } catch (_err) {
            replyOpen(timestamp, false, 'Invalid URL');
            return;
          }
          const action = inPrivate ? 'openInIncognito' : 'openInBrowserWindow';
          chrome.runtime.sendMessage(
            { action: action, url: absUrl, inPrivate: inPrivate, newWindow: newWindow },
            function (response) {
              if (!isContextValid()) {
                replyOpen(timestamp, false, RELOAD_MSG);
                return;
              }
              if (chrome.runtime.lastError) {
                replyOpen(
                  timestamp,
                  false,
                  chrome.runtime.lastError.message || (inPrivate ? OPEN_INCOGNITO_HINT : 'Failed to open browser window')
                );
                return;
              }
              if (response && response.success) {
                replyOpen(
                  timestamp,
                  true,
                  undefined,
                  response.message || (inPrivate ? 'Opened in Incognito / InPrivate' : 'Opened in a full browser window')
                );
              } else {
                replyOpen(
                  timestamp,
                  false,
                  (response && response.error) || (inPrivate ? OPEN_INCOGNITO_HINT : 'Failed to open a full browser window')
                );
              }
            }
          );
          return;
        }

        const fail =
          type === 'BROWSER_LAUNCHER_PUSH_BOOKMARKS' ||
          type === 'BROWSER_LAUNCHER_PREVIEW_PUSH_BOOKMARKS'
            ? failPush
            : type === 'BROWSER_LAUNCHER_BACKUP_BOOKMARKS'
              ? failBackup
              : failBookmarks;

        if (!isContextValid()) {
          fail(timestamp, RELOAD_MSG);
          return;
        }

        if (
          type === 'BROWSER_LAUNCHER_PUSH_BOOKMARKS' ||
          type === 'BROWSER_LAUNCHER_PREVIEW_PUSH_BOOKMARKS'
        ) {
          if (!gate.writeEnabled) {
            fail(
              timestamp,
              'Read-write OutSync is turned off. Open the toolbar popup and enable Read-write (OutSync).'
            );
            return;
          }
        } else if (type === 'BROWSER_LAUNCHER_BACKUP_BOOKMARKS') {
          if (!gate.readEnabled && !gate.writeEnabled && !gate.syncEnabled) {
            fail(
              timestamp,
              'Turn Read-only or Read-write On in the toolbar popup to back up bookmarks.'
            );
            return;
          }
        } else if (!gate.readEnabled) {
          fail(
            timestamp,
            'Read-only Sync is turned off. Open the toolbar popup and enable Read-only (Sync).'
          );
          return;
        }

        if (
          type === 'BROWSER_LAUNCHER_PUSH_BOOKMARKS' ||
          type === 'BROWSER_LAUNCHER_PREVIEW_PUSH_BOOKMARKS'
        ) {
          const sanitized = sanitizePushPayload(event.data);
          const dryRun = type === 'BROWSER_LAUNCHER_PREVIEW_PUSH_BOOKMARKS';
          if (sanitized.bookmarks.length === 0) {
            fail(timestamp, 'No http(s) bookmarks to push.');
            return;
          }
          try {
            chrome.runtime.sendMessage(
              {
                action: dryRun ? 'previewPushBookmarks' : 'pushBookmarks',
                rootFolder: sanitized.rootFolder,
                bookmarks: sanitized.bookmarks,
                dryRun: dryRun
              },
              function (response) {
                try {
                  if (!isContextValid()) {
                    failPush(timestamp, RELOAD_MSG);
                    return;
                  }
                  if (chrome.runtime.lastError) {
                    failPush(timestamp, runtimeErrorMessage());
                    return;
                  }
                  if (response && response.success) {
                    post({
                      type: 'BROWSER_LAUNCHER_PUSH_BOOKMARKS_RESULT',
                      added: Number(response.added) || 0,
                      skipped: Number(response.skipped) || 0,
                      updated: Number(response.updated) || 0,
                      changes: Array.isArray(response.changes) ? response.changes : [],
                      dryRun: !!response.dryRun,
                      rootFolder: response.rootFolder || sanitized.rootFolder,
                      timestamp: timestamp,
                      success: true,
                      version: VERSION,
                      features: FEATURES
                    });
                    return;
                  }
                  failPush(timestamp, (response && response.error) || 'Failed to push bookmarks');
                } catch (_err) {
                  failPush(timestamp, RELOAD_MSG);
                }
              }
            );
          } catch (_err) {
            failPush(timestamp, RELOAD_MSG);
          }
          return;
        }

        if (type === 'BROWSER_LAUNCHER_BACKUP_BOOKMARKS') {
          try {
            chrome.runtime.sendMessage({ action: 'exportBookmarkBackup' }, function (response) {
              try {
                if (!isContextValid()) {
                  failBackup(timestamp, RELOAD_MSG);
                  return;
                }
                if (chrome.runtime.lastError) {
                  failBackup(timestamp, runtimeErrorMessage());
                  return;
                }
                if (response && response.success && typeof response.html === 'string') {
                  post({
                    type: 'BROWSER_LAUNCHER_BOOKMARKS_BACKUP',
                    html: response.html,
                    tree: Array.isArray(response.tree) ? response.tree : [],
                    linkCount: Number(response.linkCount) || 0,
                    generatedAt: response.generatedAt || '',
                    timestamp: timestamp,
                    success: true,
                    version: VERSION,
                    features: FEATURES
                  });
                  return;
                }
                failBackup(timestamp, (response && response.error) || 'Failed to back up bookmarks');
              } catch (_err) {
                failBackup(timestamp, RELOAD_MSG);
              }
            });
          } catch (_err) {
            failBackup(timestamp, RELOAD_MSG);
          }
          return;
        }

        try {
          chrome.runtime.sendMessage({ action: 'getBookmarks' }, function (response) {
            try {
              if (!isContextValid()) {
                failBookmarks(timestamp, RELOAD_MSG);
                return;
              }
              if (chrome.runtime.lastError) {
                failBookmarks(timestamp, runtimeErrorMessage());
                return;
              }
              if (response && response.success && Array.isArray(response.bookmarks)) {
                post({
                  type: 'BROWSER_LAUNCHER_BOOKMARKS_LIST',
                  bookmarks: response.bookmarks,
                  timestamp: timestamp,
                  success: true,
                  version: VERSION,
                  features: FEATURES
                });
                return;
              }
              failBookmarks(timestamp, (response && response.error) || 'Failed to fetch bookmarks');
            } catch (_err) {
              failBookmarks(timestamp, RELOAD_MSG);
            }
          });
        } catch (_err) {
          failBookmarks(timestamp, RELOAD_MSG);
        }
      });
    } catch (_err) {
      /* never throw into the page console */
    }
  });
})();
