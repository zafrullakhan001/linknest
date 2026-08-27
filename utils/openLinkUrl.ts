import type { LinkOpenTarget } from '../types';

export function normalizeLinkOpenTarget(value: unknown): LinkOpenTarget {
  if (value === 'same' || value === 'window' || value === 'private') return value;
  return 'tab';
}

type BrowserLauncherApi = {
  open: (
    url: string,
    browserId: string,
    options?: Record<string, unknown>,
    callback?: (response: { success?: boolean; error?: string }) => void
  ) => Promise<unknown>;
  setExtensionId?: (id: string) => void;
};

function getBrowserLauncher(): BrowserLauncherApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as Window & { BrowserLauncher?: BrowserLauncherApi }).BrowserLauncher;
  return api && typeof api.open === 'function' ? api : null;
}

/** Prefer Edge on Edge UA (InPrivate), otherwise Chrome (Incognito). */
export function defaultPrivateBrowserId(): string {
  if (typeof navigator === 'undefined') return 'chrome';
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Firefox\//.test(ua)) return 'firefox';
  return 'chrome';
}

export type OpenLinkUrlOptions = {
  focus?: boolean;
  /** Browser Launcher id when opening InPrivate / Incognito (or as override). */
  browserId?: string | null;
  extensionId?: string | null;
};

/**
 * Features that request a real separate window (not a tab).
 * Do not include noopener/noreferrer here — those alone open as a tab in Chromium.
 * Null `opener` after open instead.
 */
export const SEPARATE_WINDOW_FEATURES =
  'popup=yes,width=1280,height=800,left=80,top=60,menubar=yes,toolbar=yes,location=yes,status=yes,resizable=yes,scrollbars=yes';

function detachOpener(win: Window | null): void {
  if (!win) return;
  try {
    win.opener = null;
  } catch {
    /* ignore */
  }
}

function focusWindow(win: Window | null): void {
  if (!win) return;
  try {
    win.focus();
  } catch {
    /* ignore */
  }
}

/** Open an empty popup immediately (must run in the click handler before any await). */
export function openBlankSeparateWindow(): Window | null {
  const win = window.open('about:blank', '_blank', SEPARATE_WINDOW_FEATURES);
  detachOpener(win);
  return win;
}

/**
 * If openTarget is `window`, open a blank popup now (sync, preserves user gesture).
 * Call this BEFORE await assertCanOpen / other async work, then assignUrlToWindow.
 */
export function prepareSeparateWindowIfNeeded(
  openTarget?: LinkOpenTarget | string | null
): Window | null {
  if (normalizeLinkOpenTarget(openTarget) !== 'window') return null;
  return openBlankSeparateWindow();
}

/** Navigate a pre-opened window, or fall back to openLinkUrl if it was blocked/closed. */
export function assignUrlToWindow(win: Window | null, url: string): void {
  if (win && !win.closed) {
    try {
      win.location.href = url;
      focusWindow(win);
      return;
    } catch {
      try {
        win.close();
      } catch {
        /* ignore */
      }
    }
  }
  openLinkUrl(url, 'window');
}

function openViaBrowserLauncher(
  url: string,
  browserId: string,
  options: Record<string, unknown>,
  extensionId?: string | null
): boolean {
  const launcher = getBrowserLauncher();
  if (!launcher) return false;
  if (extensionId && typeof launcher.setExtensionId === 'function') {
    launcher.setExtensionId(extensionId);
  }
  launcher.open(url, browserId, options, (response) => {
    if (response && response.success === false) {
      console.warn('[openLinkUrl] Browser launcher failed:', response.error);
    }
  }).catch((err) => {
    console.warn('[openLinkUrl] Browser launcher error:', err);
  });
  return true;
}

function openSeparateBrowserWindow(url: string, focus = true): Window | null {
  const win = window.open(url, '_blank', SEPARATE_WINDOW_FEATURES);
  detachOpener(win);
  if (focus) focusWindow(win);
  return win;
}

/**
 * Open a link URL according to the per-link open target.
 * Missing / invalid values behave like `tab` (new tab) to match prior behavior.
 * `private` uses the Browser Launcher extension (InPrivate / Incognito); without it,
 * falls back to a separate window.
 *
 * For `window`, prefer prepareSeparateWindowIfNeeded() before any await, then
 * assignUrlToWindow() — otherwise browsers demote the open to a tab.
 */
export function openLinkUrl(
  url: string,
  openTarget?: LinkOpenTarget | string | null,
  opts?: OpenLinkUrlOptions
): Window | null {
  const target = normalizeLinkOpenTarget(openTarget);

  if (target === 'same') {
    window.location.assign(url);
    return null;
  }

  if (target === 'private') {
    const browserId = (opts?.browserId && opts.browserId !== 'default')
      ? opts.browserId
      : 'default';
    const launched = openViaBrowserLauncher(
      url,
      browserId,
      { fallback: false, inPrivate: true },
      opts?.extensionId
    );
    if (launched) return null;
    console.warn(
      '[openLinkUrl] InPrivate / Incognito requires the Browser Launcher extension; opening a separate window instead.'
    );
    return openSeparateBrowserWindow(url, opts?.focus !== false);
  }

  if (target === 'window') {
    return openSeparateBrowserWindow(url, opts?.focus !== false);
  }

  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (opts?.focus) focusWindow(tab);
  return tab;
}
