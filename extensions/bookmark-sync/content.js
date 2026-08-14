/**
 * Page bridge for LinkNest Bookmark Sync.
 * Speaks the same postMessage protocol as Browser Launcher Pro, bookmarks only.
 * Only allowlisted origins receive replies; postMessage uses this page's origin (not *).
 */
(function () {
  const VERSION = '1.6.0';
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

  window.addEventListener('message', function (event) {
    try {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;
      if (event.origin !== pageOrigin()) return;

      const type = event.data.type;
      const timestamp = event.data.timestamp;

      if (type !== 'BROWSER_LAUNCHER_CHECK' && type !== 'BROWSER_LAUNCHER_GET_BOOKMARKS') {
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
            syncEnabled: !!gate.syncEnabled,
            timestamp: timestamp
          });
          return;
        }

        if (!isContextValid()) {
          failBookmarks(timestamp, RELOAD_MSG);
          return;
        }

        if (!gate.syncEnabled) {
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
