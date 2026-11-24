/** Open a sized browser popup for Device emulation (mobile-style window). */

export const DEFAULT_EMULATION_WIDTH = 390;
export const DEFAULT_EMULATION_HEIGHT = 844;
/** Extra outer height to roughly cover browser title/address chrome before measurement. */
export const EMULATION_CHROME_PAD = 88;
const WINDOW_NAME_PREFIX = 'linknest_device_preview_';
const CHROME_PAD_FALLBACK = EMULATION_CHROME_PAD;

export type DeviceEmulationSize = {
  width?: number;
  height?: number;
};

export type DeviceEmulationOptions = {
  /** Optional label shown on the bootstrap splash (e.g. device preset name). */
  label?: string;
};

function clampDim(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(4096, Math.max(120, Math.round(n)));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Splash only — no inline scripts (CSP script-src 'self' blocks them). */
function buildBootstrapHtml(targetUrl: string, width: number, height: number, label?: string): string {
  const safeUrl = escapeHtml(targetUrl);
  const safeLabel = escapeHtml(label || `${width} × ${height}`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Device preview · ${safeLabel}</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
    }
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      height: 100%;
      padding: 20px;
      text-align: center;
      background:
        radial-gradient(ellipse at 50% 0%, rgba(14,165,233,0.25), transparent 55%),
        #0f172a;
    }
    .phone {
      width: 48px;
      height: 80px;
      border-radius: 10px;
      border: 2px solid #38bdf8;
      position: relative;
      opacity: 0.9;
    }
    .phone::after {
      content: '';
      position: absolute;
      top: 6px;
      left: 50%;
      transform: translateX(-50%);
      width: 16px;
      height: 3px;
      border-radius: 2px;
      background: #38bdf8;
    }
    h1 { font-size: 14px; font-weight: 700; letter-spacing: 0.02em; }
    p { font-size: 11px; color: #94a3b8; max-width: 16rem; line-height: 1.4; }
    .url {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
      color: #7dd3fc;
      word-break: break-all;
      max-width: 100%;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="phone" aria-hidden="true"></div>
    <h1>${safeLabel}</h1>
    <p>Opening mobile-sized preview…</p>
    <p class="url">${safeUrl}</p>
  </div>
</body>
</html>`;
}

function writeBootstrapDocument(
  win: Window,
  targetUrl: string,
  width: number,
  height: number,
  label?: string
): boolean {
  try {
    win.document.open();
    win.document.write(buildBootstrapHtml(targetUrl, width, height, label));
    win.document.close();
    return true;
  } catch {
    return false;
  }
}

function measureChromePad(win: Window): { w: number; h: number } {
  try {
    const ow = win.outerWidth || 0;
    const oh = win.outerHeight || 0;
    const iw = win.innerWidth || 0;
    const ih = win.innerHeight || 0;
    if (ow > 0 && oh > 0 && iw > 0 && ih > 0) {
      return {
        w: Math.max(0, ow - iw),
        h: Math.max(0, oh - ih),
      };
    }
  } catch {
    // ignore
  }
  return { w: 0, h: CHROME_PAD_FALLBACK };
}

function sizePopupToViewport(win: Window, contentWidth: number, contentHeight: number): void {
  try {
    const pad = measureChromePad(win);
    let outerW = contentWidth + pad.w;
    let outerH = contentHeight + pad.h;
    const availW = window.screen?.availWidth || outerW;
    const availH = window.screen?.availHeight || outerH;
    outerW = Math.min(outerW, availW);
    outerH = Math.min(outerH, availH);
    win.resizeTo(outerW, outerH);
  } catch {
    try {
      win.resizeTo(contentWidth, contentHeight + CHROME_PAD_FALLBACK);
    } catch {
      // ignore
    }
  }
}

function positionAndResize(win: Window, contentWidth: number, contentHeight: number): void {
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const outerW = contentWidth;
  const outerH = contentHeight + CHROME_PAD_FALLBACK;
  const left = Math.max(0, Math.round(dualScreenLeft + (window.outerWidth - outerW) / 2));
  const top = Math.max(0, Math.round(dualScreenTop + (window.outerHeight - outerH) / 2));
  try {
    win.resizeTo(outerW, outerH);
    win.moveTo(left, top);
  } catch {
    try {
      win.resizeTo(outerW, outerH);
    } catch {
      // ignore
    }
  }
}

/**
 * From the opener: measure chrome, resize so the popup content area matches the
 * preset, then navigate. Avoids inline scripts in the splash (CSP).
 */
function finishBootstrapFromOpener(
  win: Window,
  targetUrl: string,
  contentWidth: number,
  contentHeight: number
): void {
  const run = () => {
    if (win.closed) return;
    sizePopupToViewport(win, contentWidth, contentHeight);
    window.setTimeout(() => {
      if (win.closed) return;
      // Second pass after chrome settles.
      sizePopupToViewport(win, contentWidth, contentHeight);
      try {
        win.location.replace(targetUrl);
      } catch {
        try {
          win.location.href = targetUrl;
        } catch {
          // ignore
        }
      }
    }, 60);
  };

  // Let the splash paint one frame before measuring.
  window.setTimeout(run, 0);
}

/**
 * Opens (or focuses) a minimal popup sized to a device viewport.
 * Uses a same-origin splash (no scripts), then the opener measures browser chrome,
 * resizes so innerWidth/innerHeight match the preset, and navigates to the real URL.
 * Does not use noopener so resize/focus keep working; clears opener afterward.
 */
export function openDeviceEmulationWindow(
  url: string,
  size?: DeviceEmulationSize,
  existing?: Window | null,
  options?: DeviceEmulationOptions
): Window | null {
  if (!url || typeof window === 'undefined') return null;

  const width = clampDim(size?.width ?? DEFAULT_EMULATION_WIDTH, DEFAULT_EMULATION_WIDTH);
  const height = clampDim(size?.height ?? DEFAULT_EMULATION_HEIGHT, DEFAULT_EMULATION_HEIGHT);
  const label = options?.label;

  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const openW = width;
  const openH = height + CHROME_PAD_FALLBACK;
  const left = Math.max(0, Math.round(dualScreenLeft + (window.outerWidth - openW) / 2));
  const top = Math.max(0, Math.round(dualScreenTop + (window.outerHeight - openH) / 2));

  // popup=yes hints Chromium to use a minimal chrome window.
  // location=no is often ignored by modern browsers for security.
  const features = [
    `width=${openW}`,
    `height=${openH}`,
    `left=${left}`,
    `top=${top}`,
    'popup=yes',
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');

  let win = existing && !existing.closed ? existing : null;
  if (win) {
    positionAndResize(win, width, height);
    // Prefer splash + opener-driven resize when we can still write (about:blank / same-origin).
    // If already cross-origin, only resize/focus — do not force a reload on every resize.
    const wrote = writeBootstrapDocument(win, url, width, height, label);
    if (wrote) {
      finishBootstrapFromOpener(win, url, width, height);
    } else {
      try {
        const current = win.location.href;
        if (current !== url && current !== 'about:blank') {
          win.location.href = url;
        } else if (current === 'about:blank') {
          win.location.href = url;
        }
      } catch {
        // Cross-origin after previous navigation — focus/resize only.
      }
    }
    try {
      win.focus();
    } catch {
      // ignore
    }
    return win;
  }

  // Open about:blank first so we stay same-origin long enough to write the splash
  // and measure chrome from the opener before navigating to the target site.
  win = window.open('about:blank', `${WINDOW_NAME_PREFIX}${Date.now()}`, features);
  if (!win) return null;

  try {
    win.opener = null;
  } catch {
    // ignore
  }

  positionAndResize(win, width, height);
  const wrote = writeBootstrapDocument(win, url, width, height, label);
  if (wrote) {
    finishBootstrapFromOpener(win, url, width, height);
  } else {
    try {
      win.location.href = url;
    } catch {
      // ignore
    }
  }

  try {
    win.focus();
  } catch {
    // ignore
  }
  return win;
}

/** Open Device emulation; alerts if the popup was blocked. Returns true if a window opened. */
export function openLinkInDeviceEmulation(url: string, size?: DeviceEmulationSize): boolean {
  const win = openDeviceEmulationWindow(url, size);
  if (!win) {
    alert('Pop-up was blocked. Allow pop-ups for this site, then try again.');
    return false;
  }
  return true;
}
