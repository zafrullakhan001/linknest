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
  enabled: 'syncEnabled'
};
const SYNC_DISABLED_MESSAGE =
  'Sync is turned off in the Bookmark Sync extension. Open the toolbar popup and enable Bookmark sync.';
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

function pickAppName(stored, org, locked) {
  if (locked && org) return org.appName || BRAND_DEFAULT_APP;
  return (stored && stored.appName) || (org && org.appName) || BRAND_DEFAULT_APP;
}

function pickAppUrl(stored, org, locked) {
  if (locked && org) return org.appUrl || '';
  return (stored && stored.appUrl) || (org && org.appUrl) || '';
}

function getSyncEnabled() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SYNC_STORAGE.enabled], (result) => {
      resolve(result[SYNC_STORAGE.enabled] !== false);
    });
  });
}

function setSyncEnabled(on) {
  return chrome.storage.local.set({ [SYNC_STORAGE.enabled]: !!on });
}

async function applySyncEnabledBadge(on) {
  try {
    await chrome.action.setBadgeText({ text: on ? '' : 'OFF' });
    if (!on) {
      await chrome.action.setBadgeBackgroundColor({ color: '#64748b' });
    }
  } catch (_err) {
    /* ignore */
  }
}

function getSyncStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [
        SYNC_STORAGE.count,
        SYNC_STORAGE.lastMs,
        SYNC_STORAGE.totalMs,
        SYNC_STORAGE.lastAt,
        SYNC_STORAGE.lastOk
      ],
      (result) => {
        const count = Number(result[SYNC_STORAGE.count]) || 0;
        const lastMs = Number(result[SYNC_STORAGE.lastMs]);
        const totalMs = Number(result[SYNC_STORAGE.totalMs]) || 0;
        resolve({
          count,
          lastMs: Number.isFinite(lastMs) ? lastMs : null,
          totalMs,
          averageMs: count > 0 ? Math.round(totalMs / count) : null,
          lastAt: Number(result[SYNC_STORAGE.lastAt]) || 0,
          lastOk: result[SYNC_STORAGE.lastOk] !== false
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

function recordSync(durationMs, ok) {
  const ms = Math.max(0, Math.round(Number(durationMs) || 0));
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [SYNC_STORAGE.count, SYNC_STORAGE.totalMs],
      (result) => {
        const prevCount = Number(result[SYNC_STORAGE.count]) || 0;
        const payload = {
          [SYNC_STORAGE.lastMs]: ms,
          [SYNC_STORAGE.lastAt]: Date.now(),
          [SYNC_STORAGE.lastOk]: !!ok
        };
        if (ok) {
          const count = prevCount + 1;
          payload[SYNC_STORAGE.count] = count;
          payload[SYNC_STORAGE.totalMs] = (Number(result[SYNC_STORAGE.totalMs]) || 0) + ms;
        }
        chrome.storage.local.set(payload, resolve);
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
  try {
    const res = await fetch(chrome.runtime.getURL(ORG_BRANDING_FILE), { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object' || data.enabled === false) return null;
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
  } catch (_err) {
    return null;
  }
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
