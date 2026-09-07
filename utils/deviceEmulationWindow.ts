/** Open a sized browser popup for Device emulation (DevTools device mode). */

export const DEFAULT_EMULATION_WIDTH = 390;
export const DEFAULT_EMULATION_HEIGHT = 844;
const WINDOW_NAME_PREFIX = 'linknest_device_preview_';

export type DeviceEmulationSize = {
  width?: number;
  height?: number;
};

/**
 * Opens (or focuses) a popup sized to a device viewport.
 * Does not use the noopener feature flag so resize/focus keep working;
 * clears opener afterward so SSO pages cannot drive LinkNest.
 */
export function openDeviceEmulationWindow(
  url: string,
  size?: DeviceEmulationSize,
  existing?: Window | null
): Window | null {
  if (!url || typeof window === 'undefined') return null;

  const width = Math.min(4096, Math.max(120, Math.round(size?.width || DEFAULT_EMULATION_WIDTH)));
  const height = Math.min(4096, Math.max(120, Math.round(size?.height || DEFAULT_EMULATION_HEIGHT)));
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const left = Math.max(0, Math.round(dualScreenLeft + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(dualScreenTop + (window.outerHeight - height) / 2));
  const features = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'resizable=yes',
    'scrollbars=yes',
  ].join(',');

  let win = existing && !existing.closed ? existing : null;
  if (win) {
    try {
      win.resizeTo(width, height);
      win.moveTo(left, top);
    } catch {
      try {
        win.resizeTo(width, height);
      } catch {
        // ignore
      }
    }
    try {
      if (win.location.href !== url) {
        win.location.href = url;
      }
    } catch {
      // Cross-origin after navigation
    }
    try {
      win.focus();
    } catch {
      // ignore
    }
    return win;
  }

  win = window.open(url, `${WINDOW_NAME_PREFIX}${Date.now()}`, features);
  if (!win) return null;
  try {
    win.opener = null;
  } catch {
    // ignore
  }
  try {
    win.focus();
  } catch {
    // ignore
  }
  return win;
}
