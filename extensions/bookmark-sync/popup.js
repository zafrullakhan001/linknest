const DEFAULT_LOGO = 'icons/icon48.png';

function flatten(nodes, out) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node) continue;
    const url = node.url ? String(node.url) : '';
    if (url.startsWith('http://') || url.startsWith('https://')) out.push(url);
    if (node.children && node.children.length) flatten(node.children, out);
  }
}

function setStatus(countText, statusText, isError) {
  document.getElementById('count').textContent = countText;
  const status = document.getElementById('status');
  status.textContent = statusText;
  status.classList.toggle('err', !!isError);
}

function loadCount() {
  const btn = document.getElementById('refresh');
  btn.disabled = true;
  if (!chrome.bookmarks || typeof chrome.bookmarks.getTree !== 'function') {
    setStatus('—', 'Bookmarks permission missing. Reload the extension.', true);
    btn.disabled = false;
    return;
  }
  chrome.bookmarks.getTree((tree) => {
    btn.disabled = false;
    if (chrome.runtime.lastError) {
      setStatus('—', chrome.runtime.lastError.message || 'Failed to read bookmarks', true);
      return;
    }
    const urls = [];
    flatten(tree, urls);
    setStatus(String(urls.length), 'http(s) bookmarks ready to sync', false);
  });
}

function showTab(id) {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === id);
  });
  document.getElementById('panel-sync').hidden = id !== 'sync';
  document.getElementById('panel-branding').hidden = id !== 'branding';
  document.getElementById('panel-help').hidden = id !== 'help';
}

function applyHeader(name, logoSrc) {
  document.getElementById('header-name').textContent = name || BRAND_DEFAULT_NAME;
  document.getElementById('header-logo').src = logoSrc || DEFAULT_LOGO;
  document.title = name || BRAND_DEFAULT_NAME;
}

function setBrandMsg(text, isError) {
  const el = document.getElementById('brand-msg');
  el.textContent = text || '';
  el.classList.toggle('err', !!isError);
  el.classList.toggle('ok', !!text && !isError);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read that image.'));
    img.src = src;
  });
}

async function fileToSquarePng(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('Choose a PNG, JPG, GIF, SVG, or WebP image.');
  }
  if (file.size > 4 * 1024 * 1024) {
    throw new Error('Image is too large (max 4 MB).');
  }
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(blobUrl);
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const w = Math.max(1, img.naturalWidth * scale);
    const h = Math.max(1, img.naturalHeight * scale);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

let pendingLogoDataUrl = '';
let brandingLocked = false;

function setAppNameLabel(appName, appUrl) {
  const label = document.getElementById('app-name-label');
  if (!label) return;
  const name = appName || BRAND_DEFAULT_APP;
  const url = sanitizeAppUrl(appUrl);
  label.textContent = name;
  if (url) {
    label.href = url;
    label.title = url;
    label.classList.add('is-link');
  } else {
    label.removeAttribute('href');
    label.removeAttribute('title');
    label.classList.remove('is-link');
  }
}

function renderSyncStats(stats) {
  document.getElementById('sync-times').textContent = String((stats && stats.count) || 0);
  document.getElementById('sync-last').textContent = formatSyncDuration(stats && stats.lastMs);
  document.getElementById('sync-avg').textContent = formatSyncDuration(stats && stats.averageMs);
}

function loadSyncStats() {
  getSyncStats().then(renderSyncStats);
}

function updateSyncToggleUi(on) {
  const hint = document.getElementById('sync-toggle-hint');
  const note = document.getElementById('sync-off-note');
  const version = document.getElementById('version');
  if (hint) {
    hint.textContent = on
      ? 'On — only this browser profile’s bookmarks, and only on allowlisted LinkNest sites.'
      : 'Off — the app Sync button cannot read bookmarks. Turn on to sync this profile only.';
  }
  if (note) note.hidden = !!on;
  if (version) {
    version.textContent = on
      ? 'v' + EXTENSION_VERSION + ' · this profile only'
      : 'v' + EXTENSION_VERSION + ' · sync off';
  }
}

async function hydrateSyncToggle() {
  const on = await getSyncEnabled();
  const input = document.getElementById('sync-enabled');
  if (input) input.checked = on;
  updateSyncToggleUi(on);
}

async function hydrateAllowlistHint() {
  const el = document.getElementById('allowlist-hint');
  if (!el || typeof loadOriginPolicy !== 'function') return;
  try {
    const policy = await loadOriginPolicy();
    const list = (policy && policy.allowedOrigins) || [];
    el.textContent = list.length
      ? 'Allowed LinkNest sites: ' + list.join(', ')
      : 'No sites are allowlisted. Edit org-branding.json allowedOrigins before Sync will work.';
  } catch (_err) {
    el.textContent = '';
  }
}

function setBrandingLocked(locked) {
  brandingLocked = !!locked;
  const ids = ['brand-name', 'brand-app-name', 'brand-app-url', 'pick-logo', 'clear-logo', 'logo-file', 'save-brand', 'reset-brand'];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = brandingLocked;
  });
  document.getElementById('org-lock-card').hidden = !brandingLocked;
}

async function hydrateBrandingForm() {
  const brand = await resolveBranding();
  const src = logoSrcForUi(brand) || DEFAULT_LOGO;
  pendingLogoDataUrl = brand.logoDataUrl || '';
  document.getElementById('brand-name').value = brand.name;
  document.getElementById('brand-app-name').value = brand.appName || BRAND_DEFAULT_APP;
  document.getElementById('brand-app-url').value = brand.appUrl || '';
  document.getElementById('brand-preview').src = src;
  applyHeader(brand.name, src);
  setAppNameLabel(brand.appName, brand.appUrl);
  setBrandingLocked(brand.locked);
  if (brand.source === 'org' && !brand.locked) {
    setBrandMsg('Organisation default from org-branding.json. Save to override on this browser.');
  }
}

async function saveBranding() {
  if (brandingLocked) return;
  const name = document.getElementById('brand-name').value.trim().slice(0, BRAND_NAME_MAX);
  const appName = document.getElementById('brand-app-name').value.trim().slice(0, BRAND_NAME_MAX);
  const appUrlRaw = document.getElementById('brand-app-url').value.trim();
  const appUrl = sanitizeAppUrl(appUrlRaw);
  if (!name) {
    setBrandMsg('Enter a display name.', true);
    return;
  }
  if (!appName) {
    setBrandMsg('Enter an app name for the instructions.', true);
    return;
  }
  if (appUrlRaw && !appUrl) {
    setBrandMsg('App link must be an http:// or https:// URL.', true);
    return;
  }
  const saveBtn = document.getElementById('save-brand');
  saveBtn.disabled = true;
  setBrandMsg('Saving…');
  try {
    await saveStoredBranding(name, pendingLogoDataUrl, appName, appUrl);
    const brand = await resolveBranding();
    await applyBranding({
      name,
      logoDataUrl: pendingLogoDataUrl || brand.logoDataUrl,
      logoPath: pendingLogoDataUrl ? '' : brand.logoPath
    });
    applyHeader(name, pendingLogoDataUrl || logoSrcForUi(brand) || DEFAULT_LOGO);
    document.getElementById('brand-app-url').value = appUrl;
    setAppNameLabel(appName, appUrl);
    setBrandMsg('Saved. Toolbar icon, popup name, and instructions updated.');
  } catch (err) {
    setBrandMsg((err && err.message) || 'Could not save branding.', true);
  } finally {
    saveBtn.disabled = brandingLocked;
  }
}

async function resetBranding() {
  if (brandingLocked) return;
  await clearStoredBranding();
  const brand = await resolveBranding();
  pendingLogoDataUrl = brand.logoDataUrl || '';
  const src = logoSrcForUi(brand) || DEFAULT_LOGO;
  document.getElementById('brand-name').value = brand.name;
  document.getElementById('brand-app-name').value = brand.appName || BRAND_DEFAULT_APP;
  document.getElementById('brand-app-url').value = brand.appUrl || '';
  document.getElementById('brand-preview').src = src;
  document.getElementById('logo-file').value = '';
  await applyBranding(brand);
  applyHeader(brand.name, src);
  setAppNameLabel(brand.appName, brand.appUrl);
  setBrandMsg(
    brand.source === 'org'
      ? 'Restored organisation branding from org-branding.json.'
      : 'Restored default name and logo.'
  );
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
});

document.getElementById('refresh').addEventListener('click', loadCount);

document.getElementById('pick-logo').addEventListener('click', () => {
  if (brandingLocked) return;
  document.getElementById('logo-file').click();
});

document.getElementById('logo-file').addEventListener('change', async (event) => {
  if (brandingLocked) return;
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  setBrandMsg('');
  try {
    pendingLogoDataUrl = await fileToSquarePng(file);
    document.getElementById('brand-preview').src = pendingLogoDataUrl;
    document.getElementById('header-logo').src = pendingLogoDataUrl;
  } catch (err) {
    setBrandMsg((err && err.message) || 'Could not use that image.', true);
  }
});

document.getElementById('clear-logo').addEventListener('click', () => {
  if (brandingLocked) return;
  pendingLogoDataUrl = '';
  document.getElementById('logo-file').value = '';
  document.getElementById('brand-preview').src = DEFAULT_LOGO;
  document.getElementById('header-logo').src = DEFAULT_LOGO;
  setBrandMsg('Logo will reset when you save.');
});

document.getElementById('brand-name').addEventListener('input', () => {
  const name = document.getElementById('brand-name').value.trim() || BRAND_DEFAULT_NAME;
  const logo = pendingLogoDataUrl || document.getElementById('header-logo').getAttribute('src') || DEFAULT_LOGO;
  applyHeader(name, logo);
});

document.getElementById('brand-app-name').addEventListener('input', previewAppLink);
document.getElementById('brand-app-url').addEventListener('input', previewAppLink);

document.getElementById('app-name-label').addEventListener('click', (event) => {
  const url = sanitizeAppUrl(event.currentTarget.getAttribute('href'));
  if (!url) return;
  event.preventDefault();
  chrome.tabs.create({ url });
  window.close();
});

function previewAppLink() {
  setAppNameLabel(
    document.getElementById('brand-app-name').value.trim() || BRAND_DEFAULT_APP,
    document.getElementById('brand-app-url').value.trim()
  );
}

document.getElementById('save-brand').addEventListener('click', () => void saveBranding());
document.getElementById('reset-brand').addEventListener('click', () => void resetBranding());

document.getElementById('sync-enabled').addEventListener('change', async (event) => {
  const on = !!event.target.checked;
  await setSyncEnabled(on);
  await applySyncEnabledBadge(on);
  updateSyncToggleUi(on);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.syncCount || changes.lastSyncMs || changes.totalSyncMs) {
    loadSyncStats();
  }
});

void hydrateBrandingForm();
void hydrateSyncToggle();
void hydrateAllowlistHint();
loadCount();
loadSyncStats();
