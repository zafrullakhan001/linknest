import type { LinkOpenTarget } from '../types';

export function normalizeLinkOpenTarget(value: unknown): LinkOpenTarget {
  if (value === 'same' || value === 'window' || value === 'browser' || value === 'private') return value;
  return 'tab';
}

export const LINK_OPEN_TARGET_OPTIONS: Array<{
  value: LinkOpenTarget;
  label: string;
  hint?: string;
}> = [
  { value: 'same', label: 'Same window' },
  { value: 'tab', label: 'New tab' },
  { value: 'window', label: 'New window', hint: 'Compact popup' },
  { value: 'browser', label: 'Full browser', hint: 'Tabs, toolbar, menus' },
  { value: 'private', label: 'InPrivate / Incognito' },
];

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
 * Features that request a compact popup window (not a tab, not full browser chrome).
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

function httpUrlOrNull(url: string): string | null {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function openAsTab(url: string, focus = false): Window | null {
  const tab = window.open(url, '_blank', 'noopener,noreferrer');
  if (focus) focusWindow(tab);
  return tab;
}

/**
 * Ask Bookmark Sync / Browser Launcher to open a real OS window (tabs, toolbar, menus).
 * Edge blocks microsoft-edge: from web pages, so that protocol is not used.
 */
function requestFullBrowserWindow(
  absUrl: string,
  onResult: (ok: boolean) => void
): void {
  if (typeof window === 'undefined') {
    onResult(false);
    return;
  }
  const timestamp = Date.now();
  const origin = window.location.origin;
  let settled = false;
  const finish = (ok: boolean) => {
    if (settled) return;
    settled = true;
    window.removeEventListener('message', onMessage);
    onResult(ok);
  };
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin) return;
    const data = event.data as { type?: string; timestamp?: number; success?: boolean };
    if (!data || data.type !== 'BROWSER_LAUNCHER_RESPONSE' || data.timestamp !== timestamp) return;
    finish(data.success !== false);
  };
  window.addEventListener('message', onMessage);
  try {
    window.postMessage(
      {
        type: 'BROWSER_LAUNCHER_OPEN',
        url: absUrl,
        browserId: 'default',
        timestamp,
        options: { newWindow: true, fallback: false },
      },
      origin
    );
  } catch {
    finish(false);
    return;
  }
  window.setTimeout(() => finish(false), 2000);
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
  extensionId?: string | null,
  onFail?: () => void
): boolean {
  const launcher = getBrowserLauncher();
  if (!launcher) return false;
  if (extensionId && typeof launcher.setExtensionId === 'function') {
    launcher.setExtensionId(extensionId);
  }
  let failed = false;
  const failOnce = () => {
    if (failed) return;
    failed = true;
    onFail?.();
  };
  launcher.open(url, browserId, options, (response) => {
    if (response && response.success === false) {
      console.warn('[openLinkUrl] Browser launcher failed:', response.error);
      failOnce();
    }
  }).catch((err) => {
    console.warn('[openLinkUrl] Browser launcher error:', err);
    failOnce();
  });
  return true;
}

function openSeparateBrowserWindow(url: string, focus = true): Window | null {
  const win = window.open(url, '_blank', SEPARATE_WINDOW_FEATURES);
  detachOpener(win);
  if (focus) focusWindow(win);
  return win;
}

function launcherBrowserId(opts?: OpenLinkUrlOptions): string {
  return (opts?.browserId && opts.browserId !== 'default') ? opts.browserId : 'default';
}

/**
 * Open a link URL according to the per-link open target.
 * Missing / invalid values behave like `tab` (new tab) to match prior behavior.
 * `private` uses the Browser Launcher extension (InPrivate / Incognito); without it,
 * falls back to a separate window.
 * `browser` opens a full browser window (tabs, toolbar, menus) via Bookmark Sync
 * (`chrome.windows.create` type=normal). Edge blocks microsoft-edge: from web pages.
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
  const focus = opts?.focus !== false;

  if (target === 'same') {
    window.location.assign(url);
    return null;
  }

  if (target === 'private') {
    const launched = openViaBrowserLauncher(
      url,
      launcherBrowserId(opts),
      { fallback: false, inPrivate: true },
      opts?.extensionId
    );
    if (launched) return null;
    console.warn(
      '[openLinkUrl] InPrivate / Incognito requires the Browser Launcher extension; opening a separate window instead.'
    );
    return openSeparateBrowserWindow(url, focus);
  }

  if (target === 'browser') {
    const href = httpUrlOrNull(url);
    if (!href) {
      console.warn('[openLinkUrl] Full browser window needs an http(s) URL.');
      return null;
    }
    requestFullBrowserWindow(href, (ok) => {
      if (ok) return;
      const launched = openViaBrowserLauncher(
        href,
        launcherBrowserId(opts) === 'default' ? defaultPrivateBrowserId() : launcherBrowserId(opts),
        { fallback: false, newWindow: true },
        opts?.extensionId,
        () => {
          console.warn(
            '[openLinkUrl] Full browser window needs Bookmark Sync 1.8.5+. Reload the extension, then refresh this page.'
          );
          openAsTab(href, true);
        }
      );
      if (!launched) openAsTab(href, true);
    });
    return null;
  }

  if (target === 'window') {
    return openSeparateBrowserWindow(url, focus);
  }

  return openAsTab(url, !!opts?.focus);
}
