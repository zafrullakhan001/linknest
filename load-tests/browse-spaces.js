/**
 * LinkNest browse load test — simulates concurrent users:
 *   1) Open home (auth/me, settings, styles, tiles list)
 *   2) Open several spaces (tile detail)
 *   3) "Click" links found in those spaces (HEAD/GET external or record analytics)
 *   4) Optional login + authenticated browse
 *
 * Usage:
 *   k6 run load-tests/browse-spaces.js
 *   k6 run -e BASE_URL=http://localhost/linknest -e VUS=100 -e DURATION=5m load-tests/browse-spaces.js
 *   k6 run -e LOGIN=1 -e USERNAME=admin -e PASSWORD=admin123 load-tests/browse-spaces.js
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost/linknest').replace(/\/$/, '');
const API = `${BASE_URL}/api`;
const VUS = Number(__ENV.VUS || 100);
const DURATION = __ENV.DURATION || '5m';
const RAMP = __ENV.RAMP || '30s';
const THINK_MIN = Number(__ENV.THINK_MIN || 1);
const THINK_MAX = Number(__ENV.THINK_MAX || 3);
const SPACES_PER_USER = Number(__ENV.SPACES_PER_USER || 3);
const LINKS_PER_SPACE = Number(__ENV.LINKS_PER_SPACE || 2);
const DO_LOGIN = (__ENV.LOGIN || '0') === '1';
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD || 'admin123';
const HIT_EXTERNAL_LINKS = (__ENV.HIT_EXTERNAL_LINKS || '0') === '1';
const HIT_ANALYTICS = (__ENV.HIT_ANALYTICS || '1') === '1';

const apiErrors = new Counter('linknest_api_errors');
const apiOk = new Rate('linknest_api_ok');
const homeLatency = new Trend('linknest_home_ms', true);
const spaceLatency = new Trend('linknest_space_ms', true);

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP, target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    linknest_api_ok: ['rate>0.95'],
    linknest_home_ms: ['p(95)<2000'],
    linknest_space_ms: ['p(95)<2000'],
  },
  // Keep connection reuse realistic for browsers
  noConnectionReuse: false,
  userAgent: 'LinkNest-k6-LoadTest/1.0',
};

function think() {
  const lo = Math.min(THINK_MIN, THINK_MAX);
  const hi = Math.max(THINK_MIN, THINK_MAX);
  sleep(lo + Math.random() * (hi - lo));
}

function jar() {
  return http.cookieJar();
}

function apiGet(path, tags = {}) {
  const res = http.get(`${API}${path}`, {
    headers: { Accept: 'application/json' },
    tags: { endpoint: path.split('?')[0], ...tags },
    redirects: 5,
  });
  const ok = res.status >= 200 && res.status < 400;
  apiOk.add(ok);
  if (!ok) apiErrors.add(1);
  return res;
}

function apiPost(path, body, tags = {}) {
  const res = http.post(`${API}${path}`, JSON.stringify(body), {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    tags: { endpoint: path.split('?')[0], ...tags },
  });
  const ok = res.status >= 200 && res.status < 400;
  apiOk.add(ok);
  if (!ok) apiErrors.add(1);
  return res;
}

function parseJson(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

function extractLinksFromTile(tile) {
  const urls = [];
  if (!tile || typeof tile !== 'object') return urls;

  if (tile.isHyperlink && tile.hyperlinkUrl) {
    urls.push(String(tile.hyperlinkUrl));
  }

  const tabs = Array.isArray(tile.tabs) ? tile.tabs : [];
  for (const tab of tabs) {
    const sections = Array.isArray(tab?.sections) ? tab.sections : [];
    for (const section of sections) {
      const links = Array.isArray(section?.links) ? section.links : [];
      for (const link of links) {
        if (link?.url) urls.push(String(link.url));
      }
    }
  }

  // Legacy sections shape
  const sections = Array.isArray(tile.sections) ? tile.sections : [];
  for (const section of sections) {
    const links = Array.isArray(section?.links) ? section.links : [];
    for (const link of links) {
      if (link?.url) urls.push(String(link.url));
    }
  }

  return [...new Set(urls)].filter((u) => /^https?:\/\//i.test(u));
}

function pickRandom(arr, n) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function loginIfNeeded() {
  if (!DO_LOGIN) return false;

  const res = apiPost(
    '/auth/login',
    {
      username: USERNAME,
      password: PASSWORD,
      auth_method: 'local',
      remember_me: false,
    },
    { name: 'login' }
  );

  const body = parseJson(res);
  const ok = check(res, {
    'login status 200': (r) => r.status === 200,
    'login returned user': () => !!(body && body.user),
  });
  return ok;
}

function loadHome() {
  const start = Date.now();
  let tiles = [];
  group('home', () => {
    // Parallel batch matches SPA startup traffic
    const responses = http.batch([
      ['GET', `${API}/auth/me`, null, { tags: { name: 'auth_me', endpoint: '/auth/me' } }],
      ['GET', `${API}/settings`, null, { tags: { name: 'settings', endpoint: '/settings' } }],
      ['GET', `${API}/styles`, null, { tags: { name: 'styles', endpoint: '/styles' } }],
      ['GET', `${API}/tiles?summary=1`, null, { tags: { name: 'tiles_list', endpoint: '/tiles' } }],
      ['GET', `${API}/arrangements`, null, { tags: { name: 'arrangements', endpoint: '/arrangements' } }],
    ]);

    for (const res of responses) {
      const ok = res.status >= 200 && res.status < 400;
      apiOk.add(ok);
      if (!ok) apiErrors.add(1);
    }

    check(responses[3], {
      'tiles list ok': (r) => r.status === 200,
      'tiles is array': (r) => Array.isArray(parseJson(r)),
    });

    // Reuse tiles from the home batch (avoid a second full /tiles fetch)
    const parsed = parseJson(responses[3]);
    tiles = Array.isArray(parsed) ? parsed : [];
  });
  homeLatency.add(Date.now() - start);
  return tiles;
}

function openSpace(tileId) {
  const start = Date.now();
  let tile = null;
  group('space', () => {
    const res = apiGet(`/tiles/${encodeURIComponent(tileId)}`, { name: 'tile_detail' });
    tile = parseJson(res);
    check(res, {
      'tile detail ok': (r) => r.status === 200,
      'tile has id': () => !!(tile && tile.id),
    });
  });
  spaceLatency.add(Date.now() - start);
  return tile;
}

function clickLinks(tile) {
  const urls = pickRandom(extractLinksFromTile(tile), LINKS_PER_SPACE);
  if (urls.length === 0) return;

  group('links', () => {
    for (const url of urls) {
      if (HIT_ANALYTICS) {
        // Soft analytics collect (non-fatal if addon disabled)
        apiPost(
          '/analytics/collect',
          {
            type: 'link_click',
            url,
            tileId: tile?.id || null,
            ts: Date.now(),
            source: 'k6-load-test',
          },
          { name: 'analytics_collect' }
        );
      }

      if (HIT_EXTERNAL_LINKS) {
        // Optional real outbound request — off by default to avoid hitting third parties
        const res = http.head(url, {
          timeout: '5s',
          tags: { name: 'external_link', endpoint: 'external' },
          redirects: 3,
        });
        check(res, {
          'external link responded': (r) => r.status > 0,
        });
      }

      think();
    }
  });
}

export function setup() {
  const health = http.get(`${API}/settings`, { tags: { name: 'setup_health' } });
  if (health.status !== 200) {
    throw new Error(
      `API not reachable at ${API}/settings (status ${health.status}). ` +
        `Set BASE_URL, e.g. -e BASE_URL=http://localhost/linknest`
    );
  }

  const tilesRes = http.get(`${API}/tiles`, { tags: { name: 'setup_tiles' } });
  const tiles = parseJson(tilesRes);
  if (!Array.isArray(tiles) || tiles.length === 0) {
    console.warn('WARN: No tiles returned — VUs will only exercise home endpoints.');
  } else {
    console.log(`Setup OK: ${tiles.length} tile(s) available at ${BASE_URL}`);
  }

  return {
    baseUrl: BASE_URL,
    tileCount: Array.isArray(tiles) ? tiles.length : 0,
  };
}

export default function () {
  jar(); // ensure VU cookie jar is active

  // Login once per VU (real users stay signed in). Re-login every iteration
  // floods /auth/login writes and was amplifying authenticated load failures.
  if (DO_LOGIN && __ITER === 0) {
    group('auth', () => {
      loginIfNeeded();
    });
    think();
  }

  const tiles = loadHome();
  think();

  const choices = pickRandom(tiles, SPACES_PER_USER);
  for (const t of choices) {
    if (!t?.id) continue;
    const detail = openSpace(t.id);
    think();
    if (detail) {
      clickLinks(detail);
    }
    // Return to home list (common navigation pattern)
    apiGet('/tiles', { name: 'tiles_list_nav_back' });
    think();
  }
}

export function handleSummary(data) {
  const summaryPath = __ENV.SUMMARY_JSON || 'load-tests/results/last-summary.json';
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    [summaryPath]: JSON.stringify(data, null, 2),
  };
}

function textSummary(data, opts) {
  // Lightweight local summary so we don't require k6-summary-helper import
  const indent = (opts && opts.indent) || '';
  const m = data.metrics || {};
  const line = (name, metric, asPercent = false) => {
    if (!metric || !metric.values) return '';
    const v = metric.values;
    const parts = [];
    if (v.avg !== undefined) parts.push(`avg=${Number(v.avg).toFixed(1)}`);
    if (v['p(95)'] !== undefined) parts.push(`p95=${Number(v['p(95)']).toFixed(1)}`);
    if (v['p(99)'] !== undefined) parts.push(`p99=${Number(v['p(99)']).toFixed(1)}`);
    if (v.rate !== undefined) {
      parts.push(asPercent ? `rate=${(v.rate * 100).toFixed(2)}%` : `rate=${Number(v.rate).toFixed(2)}/s`);
    }
    if (v.count !== undefined) parts.push(`count=${v.count}`);
    return `${indent}${name}: ${parts.join(' ')}\n`;
  };

  let out = `\n${indent}LinkNest load test summary\n`;
  out += `${indent}BASE_URL=${BASE_URL}  VUS=${VUS}  DURATION=${DURATION}\n`;
  out += line('http_reqs', m.http_reqs, false);
  out += line('http_req_failed', m.http_req_failed, true);
  out += line('http_req_duration', m.http_req_duration, false);
  out += line('linknest_api_ok', m.linknest_api_ok, true);
  out += line('linknest_home_ms', m.linknest_home_ms, false);
  out += line('linknest_space_ms', m.linknest_space_ms, false);
  out += line('linknest_api_errors', m.linknest_api_errors, false);

  const failed = (data.root_group && data.root_group.checks) || [];
  // Also surface threshold results
  if (data.thresholds) {
    out += `${indent}thresholds:\n`;
    for (const [name, t] of Object.entries(data.thresholds)) {
      out += `${indent}  ${t.ok ? 'OK' : 'FAIL'} ${name}\n`;
    }
  }
  return out;
}
