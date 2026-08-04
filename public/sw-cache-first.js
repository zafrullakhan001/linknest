/**
 * LinkNest Semi-PWA Service Worker
 * When enabled: cache-first for document and same-origin GET requests.
 * Hard refresh (Cache-Control: no-cache / Pragma: no-cache / cache: 'reload') fetches from network and updates cache.
 * 
 * CACHE INVALIDATION FIX:
 * - Hard refresh now clears ALL caches and broadcasts to all clients
 * - API calls use stale-while-revalidate to stay fresh
 * - Prevents outdated cache from being served after updates
 */
// __CACHE_VERSION__ is replaced by sw-cache-first.php from BUILD_INFO.json on each deploy.
// Changing this value forces browsers to drop the previous cache and load the new UI.
const CACHE_NAME = 'linknest-pwa-__CACHE_VERSION__';
const LOG_PREFIX = '[LinkNest PWA]';

// Track if hard refresh happened recently (to clear caches for subsequent API calls)
let hardRefreshTimestamp = 0;
const HARD_REFRESH_WINDOW = 2000; // 2 seconds

// Only the main page (navigation) is treated as hard refresh when user does Ctrl+F5.
function isHardRefresh(request) {
  return request.mode === 'navigate' && request.cache === 'reload';
}

function isWithinHardRefreshWindow() {
  return Date.now() - hardRefreshTimestamp < HARD_REFRESH_WINDOW;
}

function shortUrl(request) {
  try {
    const u = new URL(request.url);
    return u.pathname + (u.search || '');
  } catch (_) {
    return request.url;
  }
}

// Injected by sw-cache-first.php from admin settings (path segments: e.g. "monitors", "monitorv2").
const EXCLUDED_PATHS = __EXCLUDED_PATHS__;
const INCLUDED_PATHS = __INCLUDED_PATHS__;

function pathMatchesSegment(pathname, segment) {
  if (!segment) return false;
  return pathname.indexOf(segment) !== -1;
}

function isExcludedFromPwa(pathname) {
  return EXCLUDED_PATHS.some(function (seg) { return pathMatchesSegment(pathname, seg); });
}

function isIncludedInPwa(pathname) {
  if (INCLUDED_PATHS.length === 0) return true;
  return INCLUDED_PATHS.some(function (seg) { return pathMatchesSegment(pathname, seg); });
}

// Check if request is for API endpoint
function isApiRequest(pathname) {
  return pathname.indexOf('/api/') !== -1;
}

// Clear all caches and notify clients
async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log(LOG_PREFIX, 'All caches cleared due to hard refresh');

    // Notify all clients that cache was cleared
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'CACHE_CLEARED', timestamp: Date.now() });
    });
  } catch (e) {
    console.error(LOG_PREFIX, 'Error clearing caches:', e);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET
  if (url.origin !== self.location.origin || request.method !== 'GET') {
    return;
  }

  // Excluded paths: always fetch from network (e.g. real-time monitors).
  if (isExcludedFromPwa(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }
  // If include list is set, only cache requests whose path matches one of the segments (skip this for document navigation).
  if (request.mode !== 'navigate' && !isIncludedInPwa(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith((async () => {
    const hardRefresh = isHardRefresh(request);
    const path = shortUrl(request);
    const isApi = isApiRequest(url.pathname);

    // HARD REFRESH: Clear all caches and fetch fresh
    if (hardRefresh) {
      hardRefreshTimestamp = Date.now();
      await clearAllCaches();

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, clone);
        }
        console.log(LOG_PREFIX, 'Database/network fetch (hard refresh):', path);
        return networkResponse;
      } catch (e) {
        console.error(LOG_PREFIX, 'Network error on hard refresh:', e);
        return await fetch(request);
      }
    }

    // If within hard refresh window, bypass cache for all requests
    if (isWithinHardRefreshWindow()) {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, clone);
        }
        console.log(LOG_PREFIX, 'Database/network fetch (post-hard-refresh window):', path);
        return networkResponse;
      } catch (e) {
        console.error(LOG_PREFIX, 'Network error:', e);
        return await fetch(request);
      }
    }

    // STALE-WHILE-REVALIDATE for API calls to keep data fresh
    if (isApi) {
      const cached = await caches.match(request);

      // Start network fetch in background
      const fetchPromise = fetch(request).then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const clone = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, clone);
          console.log(LOG_PREFIX, 'Background update (API):', path);
        }
        return networkResponse;
      }).catch(e => {
        console.error(LOG_PREFIX, 'Background fetch error:', e);
        return null;
      });

      // If cached, return immediately but update in background
      if (cached) {
        console.log(LOG_PREFIX, 'Cache (stale-while-revalidate):', path);
        return cached;
      }

      // No cache, wait for network
      try {
        const networkResponse = await fetchPromise;
        if (networkResponse) {
          console.log(LOG_PREFIX, 'Database/network fetch (cache miss):', path);
          return networkResponse;
        }
      } catch (e) {
        console.error(LOG_PREFIX, 'Network error on cache miss:', e);
      }

      return await fetch(request);
    }

    // CACHE-FIRST for non-API resources
    const cached = await caches.match(request);
    if (cached) {
      console.log(LOG_PREFIX, 'Cache:', path);
      return cached;
    }

    try {
      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        const clone = networkResponse.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, clone);
      }
      console.log(LOG_PREFIX, 'Database/network fetch (cache miss):', path);
      return networkResponse;
    } catch (e) {
      throw e;
    }
  })());
});

self.addEventListener('install', (event) => {
  // Take over immediately so new deploys are not stuck waiting for old tabs to close.
  self.skipWaiting();
  console.log(LOG_PREFIX, 'Service worker installed:', CACHE_NAME);
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => {
          console.log(LOG_PREFIX, 'Deleting old cache:', name);
          return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
  console.log(LOG_PREFIX, 'Service worker active:', CACHE_NAME);
});

// Handle messages from clients (e.g., manual cache clear requests)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(clearAllCaches());
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
