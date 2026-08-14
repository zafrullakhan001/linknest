const BRAND_DEFAULT_NAME = 'LinkNest Bookmark Sync';
const BRAND_NAME_MAX = 48;
const BRAND_STORAGE = { name: 'brandName', logo: 'brandLogoDataUrl' };

function getStoredBranding() {
  return new Promise((resolve) => {
    chrome.storage.local.get([BRAND_STORAGE.name, BRAND_STORAGE.logo], (result) => {
      const name = String(result[BRAND_STORAGE.name] || '').trim();
      resolve({
        name: name || BRAND_DEFAULT_NAME,
        logoDataUrl: result[BRAND_STORAGE.logo] || ''
      });
    });
  });
}

function saveStoredBranding(name, logoDataUrl) {
  const payload = {
    [BRAND_STORAGE.name]: String(name || '').trim().slice(0, BRAND_NAME_MAX),
    [BRAND_STORAGE.logo]: logoDataUrl || ''
  };
  return chrome.storage.local.set(payload);
}

function clearStoredBranding() {
  return chrome.storage.local.remove([BRAND_STORAGE.name, BRAND_STORAGE.logo]);
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

  await chrome.action.setIcon({
    path: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    }
  });
}
