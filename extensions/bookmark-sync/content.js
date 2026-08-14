/**
 * Page bridge for LinkNest Bookmark Sync.
 * Speaks the same postMessage protocol as Browser Launcher Pro, bookmarks only.
 */
(function () {
  const VERSION = '1.5.1';
  const FEATURES = ['bookmarks'];
  const RELOAD_MSG =
    'Extension was reloaded. Refresh this page, then try Sync again.';

  function isContextValid() {
    try {
      return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
    } catch (_err) {
      return false;
    }
  }

  function post(payload) {
    try {
      window.postMessage(payload, '*');
    } catch (_err) {
      /* page may be tearing down */
    }
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

  function withSyncEnabled(callback) {
    if (!isContextValid()) {
      callback(null);
      return;
    }
    try {
      chrome.storage.local.get(['syncEnabled'], function (result) {
        if (!isContextValid()) {
          callback(null);
          return;
        }
        try {
          if (chrome.runtime.lastError) {
            callback(null);
            return;
          }
          callback(!result || result.syncEnabled !== false);
        } catch (_err) {
          callback(null);
        }
      });
    } catch (_err) {
      callback(null);
    }
  }

  window.addEventListener('message', function (event) {
    try {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;

      const type = event.data.type;
      const timestamp = event.data.timestamp;

      if (type === 'BROWSER_LAUNCHER_CHECK') {
        withSyncEnabled(function (enabled) {
          if (enabled === null) return;
          post({
            type: 'BROWSER_LAUNCHER_CHECK_RESPONSE',
            available: true,
            version: VERSION,
            name: 'LinkNest Bookmark Sync',
            features: FEATURES,
            syncEnabled: enabled,
            timestamp: timestamp
          });
        });
        return;
      }

      if (type !== 'BROWSER_LAUNCHER_GET_BOOKMARKS') return;

      if (!isContextValid()) {
        failBookmarks(timestamp, RELOAD_MSG);
        return;
      }

      withSyncEnabled(function (enabled) {
        if (enabled === null) {
          failBookmarks(timestamp, RELOAD_MSG);
          return;
        }
        if (!enabled) {
          failBookmarks(
            timestamp,
            'Sync is turned off in the Bookmark Sync extension. Open the toolbar popup and enable Bookmark sync.'
          );
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
                const err = chrome.runtime.lastError.message || '';
                failBookmarks(
                  timestamp,
                  /context invalidated/i.test(err) ? RELOAD_MSG : err || RELOAD_MSG
                );
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
