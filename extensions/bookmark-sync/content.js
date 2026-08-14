/**
 * Page bridge for LinkNest Bookmark Sync.
 * Speaks the same postMessage protocol as Browser Launcher Pro, bookmarks only.
 */
(function () {
  const VERSION = '1.1.0';
  const FEATURES = ['bookmarks'];

  function post(payload) {
    window.postMessage(payload, '*');
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

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || typeof event.data !== 'object') return;

    const type = event.data.type;
    const timestamp = event.data.timestamp;

    if (type === 'BROWSER_LAUNCHER_CHECK') {
      post({
        type: 'BROWSER_LAUNCHER_CHECK_RESPONSE',
        available: true,
        version: VERSION,
        name: 'LinkNest Bookmark Sync',
        features: FEATURES,
        timestamp: timestamp
      });
      return;
    }

    if (type !== 'BROWSER_LAUNCHER_GET_BOOKMARKS') return;

    chrome.runtime.sendMessage({ action: 'getBookmarks' }, function (response) {
      if (chrome.runtime.lastError) {
        failBookmarks(
          timestamp,
          chrome.runtime.lastError.message || 'Extension messaging failed. Reload the extension and refresh this page.'
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
    });
  });
})();
