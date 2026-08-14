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

async function hydrateBrandingForm() {
  const brand = await getStoredBranding();
  document.getElementById('brand-name').value = brand.name;
  pendingLogoDataUrl = brand.logoDataUrl || '';
  const src = pendingLogoDataUrl || DEFAULT_LOGO;
  document.getElementById('brand-preview').src = src;
  applyHeader(brand.name, src);
}

async function saveBranding() {
  const name = document.getElementById('brand-name').value.trim().slice(0, BRAND_NAME_MAX);
  if (!name) {
    setBrandMsg('Enter a display name.', true);
    return;
  }
  const saveBtn = document.getElementById('save-brand');
  saveBtn.disabled = true;
  setBrandMsg('Saving…');
  try {
    await saveStoredBranding(name, pendingLogoDataUrl);
    await applyBranding({ name, logoDataUrl: pendingLogoDataUrl });
    applyHeader(name, pendingLogoDataUrl || DEFAULT_LOGO);
    setBrandMsg('Saved. Toolbar icon and popup name updated.');
  } catch (err) {
    setBrandMsg((err && err.message) || 'Could not save branding.', true);
  } finally {
    saveBtn.disabled = false;
  }
}

async function resetBranding() {
  await clearStoredBranding();
  pendingLogoDataUrl = '';
  document.getElementById('brand-name').value = BRAND_DEFAULT_NAME;
  document.getElementById('brand-preview').src = DEFAULT_LOGO;
  document.getElementById('logo-file').value = '';
  await applyBranding({ name: BRAND_DEFAULT_NAME, logoDataUrl: '' });
  applyHeader(BRAND_DEFAULT_NAME, DEFAULT_LOGO);
  setBrandMsg('Restored default name and logo.');
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
});

document.getElementById('refresh').addEventListener('click', loadCount);

document.getElementById('pick-logo').addEventListener('click', () => {
  document.getElementById('logo-file').click();
});

document.getElementById('logo-file').addEventListener('change', async (event) => {
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
  pendingLogoDataUrl = '';
  document.getElementById('logo-file').value = '';
  document.getElementById('brand-preview').src = DEFAULT_LOGO;
  document.getElementById('header-logo').src = DEFAULT_LOGO;
  setBrandMsg('Logo will reset when you save.');
});

document.getElementById('brand-name').addEventListener('input', () => {
  const name = document.getElementById('brand-name').value.trim() || BRAND_DEFAULT_NAME;
  applyHeader(name, pendingLogoDataUrl || DEFAULT_LOGO);
});

document.getElementById('save-brand').addEventListener('click', () => void saveBranding());
document.getElementById('reset-brand').addEventListener('click', () => void resetBranding());

void hydrateBrandingForm();
loadCount();
