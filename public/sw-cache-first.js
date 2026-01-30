/**
 * LinkNest Semi-PWA Service Worker
 * When enabled: cache-first for document and same-origin GET requests.
 * Hard refresh (Cache-Control: no-cache / Pragma: no-cache / cache: 'reload') fetches from network and updates cache.
 */
const CACHE_NAME = 'linknest-pwa-v1';
const LOG_PREFIX = '[LinkNest PWA]';

// Only the main page (navigation) is treated as hard refresh when user does Ctrl+F5.
// API and subresource requests are always cache-first so tab switch / normal refresh stay fast.
function isHardRefresh(request) {
  return request.mode === 'navigate' && request.cache === 'reload';
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

    if (hardRefresh) {
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
        const cached = await caches.match(request);
        if (cached) {
          console.log(LOG_PREFIX, 'Cache (fallback after network error):', path);
          return cached;
        }
        return await fetch(request);
      }
    }

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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
  console.log(LOG_PREFIX, 'Service worker active. Cache-first for GET; hard refresh = network fetch.');
});
