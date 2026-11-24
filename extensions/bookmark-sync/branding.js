const EXTENSION_VERSION = '1.8.6';
const BRAND_DEFAULT_NAME = 'LinkNest Bookmark Sync';
const BRAND_DEFAULT_APP = 'LinkNest';
const BRAND_NAME_MAX = 48;
const BRAND_URL_MAX = 500;
const BRAND_STORAGE = {
  name: 'brandName',
  logo: 'brandLogoDataUrl',
  appName: 'brandAppName',
  appUrl: 'brandAppUrl'
};
const SYNC_STORAGE = {
  count: 'syncCount',
  lastMs: 'lastSyncMs',
  totalMs: 'totalSyncMs',
  lastAt: 'lastSyncAt',
  lastOk: 'lastSyncOk',
  enabled: 'syncEnabled',
  readEnabled: 'syncReadEnabled',
  writeEnabled: 'syncWriteEnabled',
  readCount: 'syncReadCount',
  readLastMs: 'lastReadSyncMs',
  readTotalMs: 'totalReadSyncMs',
  readLastAt: 'lastReadSyncAt',
  readLastOk: 'lastReadSyncOk',
  writeCount: 'syncWriteCount',
  writeLastMs: 'lastWriteSyncMs',
  writeTotalMs: 'totalWriteSyncMs',
  writeLastAt: 'lastWriteSyncAt',
  writeLastOk: 'lastWriteSyncOk'
};
const SYNC_READ_DISABLED_MESSAGE =
  'Read-only Sync is turned off. Open the toolbar popup and enable Read-only (Sync).';
const SYNC_WRITE_DISABLED_MESSAGE =
  'Read-write OutSync is turned off. Open the toolbar popup and enable Read-write (OutSync).';
const SYNC_DISABLED_MESSAGE = SYNC_READ_DISABLED_MESSAGE;
const ORG_BRANDING_FILE = 'org-branding.json';

function getStoredBrandingRaw() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [BRAND_STORAGE.name, BRAND_STORAGE.logo, BRAND_STORAGE.appName, BRAND_STORAGE.appUrl],
      (result) => {
        const name = String(result[BRAND_STORAGE.name] || '').trim();
        const logoDataUrl = result[BRAND_STORAGE.logo] || '';
        const appName = String(result[BRAND_STORAGE.appName] || '').trim();
        const appUrl = sanitizeAppUrl(result[BRAND_STORAGE.appUrl] || '');
        resolve({
          name,
          logoDataUrl,
          appName,
          appUrl,
          hasName: !!name,
          hasLogo: !!logoDataUrl,
          hasAppName: !!appName,
          hasAppUrl: !!appUrl
        });
      }
    );
  });
}

function getStoredBranding() {
  return getStoredBrandingRaw().then((raw) => ({
    name: raw.name || BRAND_DEFAULT_NAME,
    logoDataUrl: raw.logoDataUrl,
    appName: raw.appName || BRAND_DEFAULT_APP,
    appUrl: raw.appUrl || ''
  }));
}

function saveStoredBranding(name, logoDataUrl, appName, appUrl) {
  const payload = {
    [BRAND_STORAGE.name]: String(name || '').trim().slice(0, BRAND_NAME_MAX),
    [BRAND_STORAGE.logo]: logoDataUrl || '',
    [BRAND_STORAGE.appName]: String(appName || '').trim().slice(0, BRAND_NAME_MAX),
    [BRAND_STORAGE.appUrl]: sanitizeAppUrl(appUrl)
  };
  return chrome.storage.local.set(payload);
}

function clearStoredBranding() {
  return chrome.storage.local.remove([
    BRAND_STORAGE.name,
    BRAND_STORAGE.logo,
    BRAND_STORAGE.appName,
    BRAND_STORAGE.appUrl
  ]);
}

function sanitizeAppUrl(raw) {
  let s = String(raw || '').trim().slice(0, BRAND_URL_MAX);
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch (_err) {
    return '';
  }
}

/** Scheme + host + port only (http/https). Paths are ignored. */
function originFromHref(raw) {
  const href = sanitizeAppUrl(raw);
  if (!href) return '';
  try {
    return new URL(href).origin;
  } catch (_err) {
    return '';
  }
}

function uniqueOrigins(list) {
  const out = [];
  for (const item of list || []) {
    const origin = originFromHref(item);
    if (origin && out.indexOf(origin) === -1) out.push(origin);
  }
  return out;
}

function readManagedPolicy() {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage || !chrome.storage.managed) {
        resolve(null);
        return;
      }
      chrome.storage.managed.get(['allowedOrigins', 'syncDefaultOn'], (result) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(result && typeof result === 'object' ? result : null);
      });
    } catch (_err) {
      resolve(null);
    }
  });
}

async function loadOrgFile() {
  try {
    const res = await fetch(chrome.runtime.getURL(ORG_BRANDING_FILE), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (_err) {
    return null;
  }
}

/**
 * Origins that may receive bookmark lists, CHECK replies, or OutSync writes.
 * Fail-closed: an empty list means no page is allowed.
 * Always read from org-branding.json (even when branding enabled is false),
 * plus optional chrome.storage.managed for GPO/Intune.
 */
async function loadOriginPolicy() {
  const data = await loadOrgFile();
  const managed = await readManagedPolicy();
  const fromFile = uniqueOrigins([
    ...(Array.isArray(data && data.allowedOrigins) ? data.allowedOrigins : []),
    data && data.enabled !== false ? data.appUrl : ''
  ]);
  const fromManaged = uniqueOrigins(
    managed && Array.isArray(managed.allowedOrigins) ? managed.allowedOrigins : []
  );
  let syncDefaultOn = !!(data && data.syncDefaultOn === true);
  if (managed && typeof managed.syncDefaultOn === 'boolean') {
    syncDefaultOn = managed.syncDefaultOn;
  }
  return {
    allowedOrigins: uniqueOrigins(fromFile.concat(fromManaged)),
    syncDefaultOn
  };
}

async function isOriginAllowed(origin) {
  const normalized = originFromHref(origin);
  if (!normalized) return false;
  const policy = await loadOriginPolicy();
  return policy.allowedOrigins.indexOf(normalized) !== -1;
}

function senderPageOrigin(sender) {
  if (sender && sender.tab && sender.tab.url) return originFromHref(sender.tab.url);
  if (sender && sender.url) return originFromHref(sender.url);
  return '';
}

function pickAppName(stored, org, locked) {
  if (locked && org) return org.appName || BRAND_DEFAULT_APP;
  return (stored && stored.appName) || (org && org.appName) || BRAND_DEFAULT_APP;
}

function pickAppUrl(stored, org, locked) {
  if (locked && org) return org.appUrl || '';
  return (stored && stored.appUrl) || (org && org.appUrl) || '';
}

function storedToggle(value, fallback) {
  if (value === true) return true;
  if (value === false) return false;
  return !!fallback;
}

function getSyncModes() {
  return Promise.all([
    new Promise((resolve) => {
      chrome.storage.local.get(
        [SYNC_STORAGE.enabled, SYNC_STORAGE.readEnabled, SYNC_STORAGE.writeEnabled],
        (result) => resolve(result || {})
      );
    }),
    loadOriginPolicy()
  ]).then(([result, policy]) => {
    const defaultOn = !!(policy && policy.syncDefaultOn);
    const legacy = result[SYNC_STORAGE.enabled];
    const legacyOn = storedToggle(legacy, defaultOn);
    const read = storedToggle(result[SYNC_STORAGE.readEnabled], legacyOn);
    const write = storedToggle(result[SYNC_STORAGE.writeEnabled], legacyOn);
    return { read: read, write: write, any: !!(read || write) };
  });
}

function getSyncEnabled() {
  return getSyncModes().then((modes) => modes.any);
}

function getReadEnabled() {
  return getSyncModes().then((modes) => modes.read);
}

function getWriteEnabled() {
  return getSyncModes().then((modes) => modes.write);
}

function setReadEnabled(on) {
  return chrome.storage.local.set({ [SYNC_STORAGE.readEnabled]: !!on });
}

function setWriteEnabled(on) {
  return chrome.storage.local.set({ [SYNC_STORAGE.writeEnabled]: !!on });
}

function setSyncEnabled(on) {
  const value = !!on;
  return chrome.storage.local.set({
    [SYNC_STORAGE.enabled]: value,
    [SYNC_STORAGE.readEnabled]: value,
    [SYNC_STORAGE.writeEnabled]: value
  });
}

async function applySyncEnabledBadge(on) {
  const anyOn = on && typeof on === 'object' ? !!on.any : !!on;
  try {
    await chrome.action.setBadgeText({ text: anyOn ? '' : 'OFF' });
    if (!anyOn) {
      await chrome.action.setBadgeBackgroundColor({ color: '#64748b' });
    }
  } catch (_err) {
    /* ignore */
  }
}

function parseStatBlock(result, countKey, lastMsKey, totalMsKey, lastAtKey, lastOkKey, fallback) {
  const hasOwn = result[countKey] != null;
  const count = hasOwn
    ? Number(result[countKey]) || 0
    : fallback
      ? Number(result[fallback.count]) || 0
      : 0;
  const lastMsRaw = hasOwn ? result[lastMsKey] : result[lastMsKey] != null ? result[lastMsKey] : fallback && result[fallback.lastMs];
  const lastMs = Number(lastMsRaw);
  const totalMs = hasOwn
    ? Number(result[totalMsKey]) || 0
    : fallback
      ? Number(result[fallback.totalMs]) || 0
      : 0;
  const lastAt = hasOwn
    ? Number(result[lastAtKey]) || 0
    : fallback
      ? Number(result[fallback.lastAt]) || 0
      : 0;
  const lastOkRaw = hasOwn ? result[lastOkKey] : result[lastOkKey] != null ? result[lastOkKey] : fallback && result[fallback.lastOk];
  return {
    count: count,
    lastMs: Number.isFinite(lastMs) ? lastMs : null,
    totalMs: totalMs,
    averageMs: count > 0 ? Math.round(totalMs / count) : null,
    lastAt: lastAt,
    lastOk: lastOkRaw !== false
  };
}

function getSyncStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        SYNC_STORAGE.count,
        SYNC_STORAGE.lastMs,
        SYNC_STORAGE.totalMs,
        SYNC_STORAGE.lastAt,
        SYNC_STORAGE.lastOk,
        SYNC_STORAGE.readCount,
        SYNC_STORAGE.readLastMs,
        SYNC_STORAGE.readTotalMs,
        SYNC_STORAGE.readLastAt,
        SYNC_STORAGE.readLastOk,
        SYNC_STORAGE.writeCount,
        SYNC_STORAGE.writeLastMs,
        SYNC_STORAGE.writeTotalMs,
        SYNC_STORAGE.writeLastAt,
        SYNC_STORAGE.writeLastOk
      ],
      (result) => {
        const row = result || {};
        const legacy = {
          count: SYNC_STORAGE.count,
          lastMs: SYNC_STORAGE.lastMs,
          totalMs: SYNC_STORAGE.totalMs,
          lastAt: SYNC_STORAGE.lastAt,
          lastOk: SYNC_STORAGE.lastOk
        };
        resolve({
          read: parseStatBlock(
            row,
            SYNC_STORAGE.readCount,
            SYNC_STORAGE.readLastMs,
            SYNC_STORAGE.readTotalMs,
            SYNC_STORAGE.readLastAt,
            SYNC_STORAGE.readLastOk,
            legacy
          ),
          write: parseStatBlock(
            row,
            SYNC_STORAGE.writeCount,
            SYNC_STORAGE.writeLastMs,
            SYNC_STORAGE.writeTotalMs,
            SYNC_STORAGE.writeLastAt,
            SYNC_STORAGE.writeLastOk
          )
        });
      }
    );
  });
}

function formatSyncDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return Math.round(ms) + ' ms';
  if (ms < 10000) return (ms / 1000).toFixed(2) + ' s';
  return (ms / 1000).toFixed(1) + ' s';
}

function recordSync(durationMs, ok, kind) {
  const ms = Math.max(0, Math.round(Number(durationMs) || 0));
  const isWrite = kind === 'write';
  const countKey = isWrite ? SYNC_STORAGE.writeCount : SYNC_STORAGE.readCount;
  const totalKey = isWrite ? SYNC_STORAGE.writeTotalMs : SYNC_STORAGE.readTotalMs;
  const lastMsKey = isWrite ? SYNC_STORAGE.writeLastMs : SYNC_STORAGE.readLastMs;
  const lastAtKey = isWrite ? SYNC_STORAGE.writeLastAt : SYNC_STORAGE.readLastAt;
  const lastOkKey = isWrite ? SYNC_STORAGE.writeLastOk : SYNC_STORAGE.readLastOk;
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [countKey, totalKey, SYNC_STORAGE.count, SYNC_STORAGE.totalMs],
      (result) => {
        let prevCount = result[countKey] != null ? Number(result[countKey]) || 0 : null;
        let prevTotal = result[totalKey] != null ? Number(result[totalKey]) || 0 : null;
        if (!isWrite && prevCount == null) {
          prevCount = Number(result[SYNC_STORAGE.count]) || 0;
          prevTotal = Number(result[SYNC_STORAGE.totalMs]) || 0;
        }
        prevCount = prevCount || 0;
        prevTotal = prevTotal || 0;
        const payload = {
          [lastMsKey]: ms,
          [lastAtKey]: Date.now(),
          [lastOkKey]: !!ok
        };
        if (ok) {
          const count = prevCount + 1;
          payload[countKey] = count;
          payload[totalKey] = prevTotal + ms;
        }
        chrome.storage.local.set(payload, resolve);
      }
    );
  });
}

function migrateLegacySyncStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        SYNC_STORAGE.count,
        SYNC_STORAGE.lastMs,
        SYNC_STORAGE.totalMs,
        SYNC_STORAGE.lastAt,
        SYNC_STORAGE.lastOk,
        SYNC_STORAGE.readCount
      ],
      (result) => {
        if (result && result[SYNC_STORAGE.readCount] != null) {
          resolve();
          return;
        }
        const count = Number(result && result[SYNC_STORAGE.count]) || 0;
        if (!count) {
          resolve();
          return;
        }
        chrome.storage.local.set(
          {
            [SYNC_STORAGE.readCount]: count,
            [SYNC_STORAGE.readLastMs]: Number(result[SYNC_STORAGE.lastMs]) || 0,
            [SYNC_STORAGE.readTotalMs]: Number(result[SYNC_STORAGE.totalMs]) || 0,
            [SYNC_STORAGE.readLastAt]: Number(result[SYNC_STORAGE.lastAt]) || 0,
            [SYNC_STORAGE.readLastOk]: result[SYNC_STORAGE.lastOk] !== false
          },
          resolve
        );
      }
    );
  });
}

function safeLogoPath(raw) {
  const p = String(raw || '').trim().replace(/\\/g, '/');
  if (!p || p.startsWith('/') || p.includes('..') || /^[a-z]+:/i.test(p)) return '';
  return p;
}

async function loadOrgConfig() {
  const data = await loadOrgFile();
  if (!data || data.enabled === false) return null;
  const name = String(data.name || '').trim().slice(0, BRAND_NAME_MAX);
  const appName = String(data.appName || '').trim().slice(0, BRAND_NAME_MAX);
  const appUrl = sanitizeAppUrl(data.appUrl || data.url || '');
  const logoRaw = String(data.logo || '').trim();
  if (!name && !logoRaw && !appName && !appUrl) return null;
  return {
    name,
    appName,
    appUrl,
    logoRaw,
    locked: data.locked === true
  };
}

function orgLogoParts(logoRaw) {
  if (!logoRaw) return { logoDataUrl: '', logoPath: '' };
  if (logoRaw.indexOf('data:image/') === 0) {
    return { logoDataUrl: logoRaw, logoPath: '' };
  }
  return { logoDataUrl: '', logoPath: safeLogoPath(logoRaw) };
}

async function resolveBranding() {
  const org = await loadOrgConfig();
  const stored = await getStoredBrandingRaw();

  if (org && org.locked) {
    return {
      name: org.name || BRAND_DEFAULT_NAME,
      appName: pickAppName(stored, org, true),
      appUrl: pickAppUrl(stored, org, true),
      ...orgLogoParts(org.logoRaw),
      source: 'org',
      locked: true,
      orgEnabled: true
    };
  }

  if (stored.hasName || stored.hasLogo || stored.hasAppName || stored.hasAppUrl) {
    const orgLogo = org ? orgLogoParts(org.logoRaw) : { logoDataUrl: '', logoPath: '' };
    return {
      name: stored.name || (org && org.name) || BRAND_DEFAULT_NAME,
      appName: pickAppName(stored, org, false),
      appUrl: pickAppUrl(stored, org, false),
      logoDataUrl: stored.logoDataUrl || '',
      logoPath: stored.logoDataUrl ? '' : orgLogo.logoPath || '',
      source: 'user',
      locked: false,
      orgEnabled: !!org
    };
  }

  if (org) {
    return {
      name: org.name || BRAND_DEFAULT_NAME,
      appName: pickAppName(stored, org, false),
      appUrl: pickAppUrl(stored, org, false),
      ...orgLogoParts(org.logoRaw),
      source: 'org',
      locked: false,
      orgEnabled: true
    };
  }

  return {
    name: BRAND_DEFAULT_NAME,
    appName: BRAND_DEFAULT_APP,
    appUrl: '',
    logoDataUrl: '',
    logoPath: '',
    source: 'default',
    locked: false,
    orgEnabled: false
  };
}

function logoSrcForUi(brand) {
  if (brand && brand.logoDataUrl) return brand.logoDataUrl;
  if (brand && brand.logoPath) return chrome.runtime.getURL(brand.logoPath);
  return '';
}

async function dataUrlToImageData(dataUrl, size) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  let ctx;
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(size, size);
    ctx = canvas.getContext('2d');
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    ctx = canvas.getContext('2d');
  }
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  return ctx.getImageData(0, 0, size, size);
}

async function applyBranding(brand) {
  const name = (brand && brand.name && String(brand.name).trim()) || BRAND_DEFAULT_NAME;
  try {
    await chrome.action.setTitle({ title: name });
  } catch (_err) {
    /* ignore */
  }

  if (brand && brand.logoDataUrl) {
    const imageData = {};
    for (const size of [16, 32, 48, 128]) {
      imageData[size] = await dataUrlToImageData(brand.logoDataUrl, size);
    }
    await chrome.action.setIcon({ imageData });
    return;
  }

  if (brand && brand.logoPath) {
    try {
      await chrome.action.setIcon({
        path: {
          16: brand.logoPath,
          32: brand.logoPath,
          48: brand.logoPath,
          128: brand.logoPath
        }
      });
      return;
    } catch (_err) {
      const url = chrome.runtime.getURL(brand.logoPath);
      const imageData = {};
      for (const size of [16, 32, 48, 128]) {
        imageData[size] = await dataUrlToImageData(url, size);
      }
      await chrome.action.setIcon({ imageData });
      return;
    }
  }

  await chrome.action.setIcon({
    path: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    }
  });
}
