import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDisplayUrl } from '../utils/urlDisplay';

type DeviceMode = 'phone' | 'tablet' | 'watch';
type WatchShape = 'square' | 'round';
type PreviewMode = 'in-app' | 'emulation';

interface MobilePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  label: string;
}

interface EmulationPreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

const DEVICE_SIZES: Record<DeviceMode, { width: number; height: number; label: string }> = {
  phone: { width: 375, height: 812, label: 'Phone' },
  tablet: { width: 768, height: 1024, label: 'Tablet' },
  watch: { width: 198, height: 242, label: 'Watch' },
};

const WATCH_SIZES: Record<WatchShape, { width: number; height: number; label: string }> = {
  square: { width: 198, height: 242, label: 'Square' },
  round: { width: 360, height: 360, label: 'Round' },
};

const EMULATION_PRESETS: EmulationPreset[] = [
  { id: 'responsive', label: 'Responsive', width: 543, height: 1006 },
  { id: 'phone', label: 'Phone', width: 375, height: 812 },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667 },
  { id: 'iphone-14', label: 'iPhone 14', width: 390, height: 844 },
  { id: 'pixel-7', label: 'Pixel 7', width: 412, height: 915 },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024 },
  { id: 'ipad', label: 'iPad', width: 820, height: 1180 },
  { id: 'watch-square', label: 'Watch (Square)', width: 198, height: 242 },
  { id: 'watch-round', label: 'Watch (Round)', width: 360, height: 360 },
];

const ZOOM_OPTIONS = [25, 50, 75, 100, 125, 150];

const DEVICE_MODES: DeviceMode[] = ['phone', 'tablet', 'watch'];
const WATCH_SHAPES: WatchShape[] = ['square', 'round'];
const PREVIEW_WINDOW_NAME = 'linknest_device_preview';

function stripHtmlTags(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') return content.replace(/<[^>]*>/g, '');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return tempDiv.textContent || tempDiv.innerText || '';
}

function clampDim(n: number): number {
  if (!Number.isFinite(n)) return 375;
  return Math.min(4096, Math.max(120, Math.round(n)));
}

function looksLikeEmbedBlock(frame: HTMLIFrameElement): boolean {
  try {
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    const href = win?.location?.href || doc?.URL || '';
    if (
      href.startsWith('chrome-error:') ||
      href.startsWith('chromewebdata:') ||
      href === 'about:blank'
    ) {
      return true;
    }
    if (doc?.body) {
      const text = (doc.body.innerText || '').toLowerCase();
      if (
        text.includes('refused to connect') ||
        text.includes('blocked by an extension') ||
        text.includes('is blocked') ||
        text.includes('cannot be displayed in a frame') ||
        text.includes('x-frame-options')
      ) {
        return true;
      }
      if (doc.body.childElementCount === 0 && !text.trim()) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '') || /Mac OS/i.test(navigator.userAgent || '');
}

/** Hosts that commonly refuse third-party iframes (instant client hint). */
const KNOWN_FRAME_BLOCK_HOSTS = [
  /(^|\.)google\./i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)gmail\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)microsoft\.com$/i,
  /(^|\.)office\.com$/i,
  /(^|\.)live\.com$/i,
  /(^|\.)outlook\.com$/i,
  /(^|\.)apple\.com$/i,
  /(^|\.)icloud\.com$/i,
  /(^|\.)amazon\./i,
  /(^|\.)github\.com$/i,
  /(^|\.)paypal\.com$/i,
  /(^|\.)netflix\.com$/i,
];

function getUrlHost(raw: string): string | null {
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isKnownFrameBlocker(rawUrl: string): boolean {
  const host = getUrlHost(rawUrl);
  if (!host) return false;
  return KNOWN_FRAME_BLOCK_HOSTS.some((re) => re.test(host));
}

async function checkUrlEmbeddable(rawUrl: string): Promise<{ embeddable: boolean | null; reason: string | null }> {
  if (isKnownFrameBlocker(rawUrl)) {
    return { embeddable: false, reason: 'This site typically blocks iframe embedding' };
  }

  try {
    const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';
    const res = await fetch(`${API_BASE}/framecheck?url=${encodeURIComponent(rawUrl)}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      return { embeddable: null, reason: null };
    }
    const json = await res.json();
    const data = json?.data;
    if (typeof data?.embeddable === 'boolean') {
      return {
        embeddable: data.embeddable,
        reason: data.reason || (data.embeddable ? null : 'This site blocks iframe embedding'),
      };
    }
    return { embeddable: null, reason: null };
  } catch {
    return { embeddable: null, reason: null };
  }
}

export const MobilePreviewDialog: React.FC<MobilePreviewDialogProps> = ({
  isOpen,
  onClose,
  url,
  label,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewWinRef = useRef<Window | null>(null);
  const [device, setDevice] = useState<DeviceMode>('phone');
  const [watchShape, setWatchShape] = useState<WatchShape>('square');
  const [previewMode, setPreviewMode] = useState<PreviewMode>('in-app');
  const [presetId, setPresetId] = useState('phone');
  const [emuWidth, setEmuWidth] = useState(375);
  const [emuHeight, setEmuHeight] = useState(812);
  const [zoomPercent, setZoomPercent] = useState(50);
  const [scale, setScale] = useState(1);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [allowIframeMount, setAllowIframeMount] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [windowOpened, setWindowOpened] = useState(false);
  const loadGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const plainLabel = useMemo(() => stripHtmlTags(label || ''), [label]);

  const isWatch = device === 'watch';
  const isPhone = device === 'phone';
  const isRoundWatch = isWatch && watchShape === 'round';
  const isEmulationMode = previewMode === 'emulation';
  const emulateShortcut = isMacPlatform() ? '⌘ + Shift + M' : 'Ctrl + Shift + M';

  const inAppSize = useMemo(() => {
    if (device === 'watch') {
      const w = WATCH_SIZES[watchShape];
      return { width: w.width, height: w.height, label: `Watch · ${w.label}` };
    }
    return DEVICE_SIZES[device];
  }, [device, watchShape]);

  const size = isEmulationMode
    ? { width: emuWidth, height: emuHeight, label: EMULATION_PRESETS.find((p) => p.id === presetId)?.label || 'Custom' }
    : inAppSize;

  const applyPreset = useCallback((id: string) => {
    const preset = EMULATION_PRESETS.find((p) => p.id === id) || EMULATION_PRESETS[0];
    setPresetId(preset.id);
    setEmuWidth(preset.width);
    setEmuHeight(preset.height);
  }, []);

  const markResponsiveIfNeeded = useCallback((nextW: number, nextH: number) => {
    const match = EMULATION_PRESETS.find(
      (p) => p.id !== 'responsive' && p.width === nextW && p.height === nextH
    );
    setPresetId(match ? match.id : 'responsive');
  }, []);

  const rotateViewport = useCallback(() => {
    const nextW = emuHeight;
    const nextH = emuWidth;
    setEmuWidth(nextW);
    setEmuHeight(nextH);
    markResponsiveIfNeeded(nextW, nextH);
  }, [emuWidth, emuHeight, markResponsiveIfNeeded]);

  const closePreviewWindow = useCallback(() => {
    const win = previewWinRef.current;
    if (win && !win.closed) {
      try {
        win.close();
      } catch {
        // ignore
      }
    }
    previewWinRef.current = null;
    setWindowOpened(false);
  }, []);

  const openDeviceWindow = useCallback(() => {
    if (!url) return null;

    const width = size.width;
    const height = size.height;
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

    let win = previewWinRef.current;
    if (win && !win.closed) {
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
      setPopupBlocked(false);
      setWindowOpened(true);
      return win;
    }

    win = window.open(url, PREVIEW_WINDOW_NAME, features);
    previewWinRef.current = win;
    if (!win) {
      setPopupBlocked(true);
      setWindowOpened(false);
      return null;
    }
    setPopupBlocked(false);
    setWindowOpened(true);
    try {
      win.focus();
    } catch {
      // ignore
    }
    return win;
  }, [url, size.width, size.height]);

  const switchToEmulationMode = useCallback(() => {
    setPreviewMode('emulation');
    openDeviceWindow();
  }, [openDeviceWindow]);

  const updateScale = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || isEmulationMode) return;
    const padding = 24;
    const availableWidth = Math.max(120, stage.clientWidth - padding);
    const availableHeight = Math.max(120, stage.clientHeight - padding);
    const crownExtra = isWatch ? 24 : 0;
    const bezel = isWatch ? 28 : 16;
    const frameWidth = size.width + bezel + crownExtra;
    const frameHeight = size.height + bezel;
    const nextScale = Math.min(1, availableWidth / frameWidth, availableHeight / frameHeight);
    const maxScale = isWatch ? 1.75 : 1;
    setScale(Math.min(maxScale, Math.max(0.25, nextScale)));
  }, [isEmulationMode, isWatch, size.height, size.width]);

  useEffect(() => {
    if (!isOpen) return;

    dialogRef.current?.focus();
    setDevice('phone');
    setWatchShape('square');
    setPreviewMode('in-app');
    setPresetId('phone');
    setEmuWidth(375);
    setEmuHeight(812);
    setZoomPercent(50);
    setIframeBlocked(false);
    setBlockReason(null);
    setIframeLoading(true);
    setAllowIframeMount(false);
    setPopupBlocked(false);
    setWindowOpened(false);

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscKey, true);
    return () => {
      window.removeEventListener('keydown', handleEscKey, true);
      closePreviewWindow();
    };
  }, [isOpen, onClose, closePreviewWindow]);

  useEffect(() => {
    if (!isOpen) return;
    updateScale();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateScale);
      return () => window.removeEventListener('resize', updateScale);
    }
    const observer = new ResizeObserver(() => updateScale());
    observer.observe(stage);
    window.addEventListener('resize', updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, [isOpen, updateScale]);

  useEffect(() => {
    if (!isOpen || !url || isEmulationMode) return;

    let cancelled = false;
    setIframeBlocked(false);
    setBlockReason(null);
    setIframeLoading(true);
    setAllowIframeMount(false);

    if (loadGuardRef.current) clearTimeout(loadGuardRef.current);

    const markBlocked = (reason: string) => {
      if (cancelled) return;
      setIframeBlocked(true);
      setBlockReason(reason);
      setIframeLoading(false);
      setAllowIframeMount(false);
    };

    // Instant known blockers (e.g. google.com) — skip iframe entirely.
    if (isKnownFrameBlocker(url)) {
      markBlocked('This site typically blocks iframe embedding');
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const result = await checkUrlEmbeddable(url);
      if (cancelled) return;

      if (result.embeddable === false) {
        markBlocked(result.reason || 'This site blocks iframe embedding');
        return;
      }

      // Allowed or unknown — mount iframe and watch for browser "refused to connect".
      setAllowIframeMount(true);
      loadGuardRef.current = setTimeout(() => {
        if (!cancelled) setIframeLoading(false);
      }, 6000);
    })();

    return () => {
      cancelled = true;
      if (loadGuardRef.current) clearTimeout(loadGuardRef.current);
    };
  }, [isOpen, url, device, watchShape, isEmulationMode]);

  useEffect(() => {
    if (!isOpen || !isEmulationMode || !windowOpened) return;
    const win = previewWinRef.current;
    if (!win || win.closed) {
      setWindowOpened(false);
      return;
    }
    try {
      win.resizeTo(size.width, size.height);
    } catch {
      // ignore
    }
  }, [isOpen, isEmulationMode, windowOpened, size.width, size.height]);

  if (!isOpen || typeof document === 'undefined') return null;

  const displayUrl = getDisplayUrl(url);
  const bezelPadding = isRoundWatch ? 18 : isWatch ? 12 : 8;
  const emuPreviewScale = zoomPercent / 100;

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    if (loadGuardRef.current) clearTimeout(loadGuardRef.current);
    setIframeLoading(false);
    const frame = e.currentTarget;
    const blocked = looksLikeEmbedBlock(frame);
    if (blocked) {
      setIframeBlocked(true);
      setBlockReason('This site refused to connect inside the preview (iframe blocked)');
      return;
    }
    // Chromium sometimes finishes paint of chrome-error after onLoad.
    window.setTimeout(() => {
      if (!iframeRef.current) return;
      if (looksLikeEmbedBlock(iframeRef.current)) {
        setIframeBlocked(true);
        setBlockReason('This site refused to connect inside the preview (iframe blocked)');
      }
    }, 250);
  };

  const handleIframeError = () => {
    if (loadGuardRef.current) clearTimeout(loadGuardRef.current);
    setIframeLoading(false);
    setIframeBlocked(true);
    setBlockReason('This site blocked the in-app preview');
  };

  const openInNewTab = () => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const outerRadiusClass = isRoundWatch
    ? 'rounded-full'
    : isWatch
      ? 'rounded-[2.25rem]'
      : isPhone
        ? 'rounded-[2rem]'
        : 'rounded-2xl';

  const innerRadiusClass = isRoundWatch
    ? 'rounded-full'
    : isWatch
      ? 'rounded-[1.75rem]'
      : isPhone
        ? 'rounded-[1.5rem]'
        : 'rounded-xl';

  const inputClass =
    'h-7 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm outline-none"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-preview-dialog-title"
      tabIndex={-1}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl h-[min(92vh,920px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3
              id="mobile-preview-dialog-title"
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
              title={plainLabel}
            >
              {plainLabel || 'Mobile preview'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate font-mono" title={url}>
              {displayUrl}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              className="inline-flex rounded-lg border border-slate-200 dark:border-slate-600 p-0.5 bg-slate-50 dark:bg-slate-900/50"
              role="group"
              aria-label="Preview method"
            >
              <button
                type="button"
                onClick={() => setPreviewMode('in-app')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  !isEmulationMode
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                aria-pressed={!isEmulationMode}
                title="Preview inside LinkNest (iframe)"
              >
                In-app
              </button>
              <button
                type="button"
                onClick={switchToEmulationMode}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  isEmulationMode
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                aria-pressed={isEmulationMode}
                title="Device emulation via sized browser window (like DevTools)"
              >
                Device emulation
              </button>
            </div>

            {!isEmulationMode && (
              <>
                <div
                  className="inline-flex rounded-lg border border-slate-200 dark:border-slate-600 p-0.5 bg-slate-50 dark:bg-slate-900/50"
                  role="group"
                  aria-label="Device size"
                >
                  {DEVICE_MODES.map((mode) => {
                    const active = device === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDevice(mode)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                          active
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                        aria-pressed={active}
                        title={`${DEVICE_SIZES[mode].label} view`}
                      >
                        {DEVICE_SIZES[mode].label}
                      </button>
                    );
                  })}
                </div>

                {isWatch && (
                  <div
                    className="inline-flex rounded-lg border border-slate-200 dark:border-slate-600 p-0.5 bg-slate-50 dark:bg-slate-900/50"
                    role="group"
                    aria-label="Watch shape"
                  >
                    {WATCH_SHAPES.map((shape) => {
                      const active = watchShape === shape;
                      return (
                        <button
                          key={shape}
                          type="button"
                          onClick={() => setWatchShape(shape)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            active
                              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                          aria-pressed={active}
                          title={`${WATCH_SIZES[shape].label} watch`}
                        >
                          {shape === 'round' ? (
                            <span className="inline-block w-3 h-3 rounded-full border-2 border-current" aria-hidden />
                          ) : (
                            <span className="inline-block w-2.5 h-3 rounded-[3px] border-2 border-current" aria-hidden />
                          )}
                          {WATCH_SIZES[shape].label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              title="Close"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* DevTools-style device toolbar (emulation mode) */}
        {isEmulationMode && (
          <div className="px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400" title="Device emulation">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M8 16.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z" />
                <path fillRule="evenodd" d="M4 4a3 3 0 013-3h6a3 3 0 013 3v12a3 3 0 01-3 3H7a3 3 0 01-3-3V4zm4-1.5v.75c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75V2.5h1A1.5 1.5 0 0114.5 4v12a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 16V4A1.5 1.5 0 017 2.5h1z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] font-semibold uppercase tracking-wide hidden sm:inline">Dimensions</span>
            </div>

            <select
              className={`${inputClass} min-w-[9rem]`}
              value={presetId}
              onChange={(e) => applyPreset(e.target.value)}
              aria-label="Device preset"
            >
              {EMULATION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <div className="inline-flex items-center gap-1">
              <input
                type="number"
                min={120}
                max={4096}
                value={emuWidth}
                onChange={(e) => {
                  const next = clampDim(Number(e.target.value));
                  setEmuWidth(next);
                  markResponsiveIfNeeded(next, emuHeight);
                }}
                className={`${inputClass} w-[4.5rem]`}
                aria-label="Viewport width"
                title="Width"
              />
              <span className="text-xs text-slate-400">×</span>
              <input
                type="number"
                min={120}
                max={4096}
                value={emuHeight}
                onChange={(e) => {
                  const next = clampDim(Number(e.target.value));
                  setEmuHeight(next);
                  markResponsiveIfNeeded(emuWidth, next);
                }}
                className={`${inputClass} w-[4.5rem]`}
                aria-label="Viewport height"
                title="Height"
              />
            </div>

            <select
              className={`${inputClass} w-[4.75rem]`}
              value={zoomPercent}
              onChange={(e) => setZoomPercent(Number(e.target.value))}
              aria-label="Preview zoom"
              title="Preview zoom (stage only)"
            >
              {ZOOM_OPTIONS.map((z) => (
                <option key={z} value={z}>
                  {z}%
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={rotateViewport}
              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              title="Rotate viewport"
              aria-label="Rotate viewport"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => openDeviceWindow()}
              disabled={!url}
              className="h-7 px-3 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-50"
            >
              {windowOpened ? 'Focus window' : 'Open window'}
            </button>
          </div>
        )}

        <div
          ref={stageRef}
          className="flex-1 min-h-0 overflow-auto bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center p-3"
        >
          {isEmulationMode ? (
            <div className="w-full max-w-3xl flex flex-col items-center gap-4 py-2">
              {/* Scaled viewport outline (Chrome-like stage) */}
              <div
                className="relative shadow-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 overflow-hidden"
                style={{
                  width: size.width * emuPreviewScale,
                  height: size.height * emuPreviewScale,
                  maxWidth: '100%',
                }}
              >
                <div
                  className="origin-top-left pointer-events-none absolute top-0 left-0 flex flex-col"
                  style={{
                    width: size.width,
                    height: size.height,
                    transform: `scale(${emuPreviewScale})`,
                  }}
                >
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
                    <div className="w-12 h-12 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-200">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
                        <path d="M8 16.25a.75.75 0 01.75-.75h2.5a.75.75 0 010 1.5h-2.5a.75.75 0 01-.75-.75z" />
                        <path fillRule="evenodd" d="M4 4a3 3 0 013-3h6a3 3 0 013 3v12a3 3 0 01-3 3H7a3 3 0 01-3-3V4zm4-1.5v.75c0 .414.336.75.75.75h2.5a.75.75 0 00.75-.75V2.5h1A1.5 1.5 0 0114.5 4v12a1.5 1.5 0 01-1.5 1.5H7A1.5 1.5 0 015.5 16V4A1.5 1.5 0 017 2.5h1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {size.label} · {size.width} × {size.height}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
                      Open a real browser window at this size, then toggle Chrome/Edge device mode for user-agent and touch simulation.
                    </p>
                  </div>
                </div>
              </div>

              <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-left space-y-2">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Use the browser like DevTools
                </p>
                <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>Click <span className="font-medium text-slate-700 dark:text-slate-200">Open window</span> (loads the real site — works even when iframes are blocked).</li>
                  <li>In that window open DevTools (<span className="font-mono text-[11px]">F12</span>).</li>
                  <li>
                    Click the device icon or press{' '}
                    <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono text-[11px] text-slate-700 dark:text-slate-200">
                      {emulateShortcut}
                    </kbd>{' '}
                    to toggle device emulation.
                  </li>
                  <li>Match Dimensions to this toolbar ({size.width} × {size.height}), or pick a device preset in DevTools.</li>
                </ol>
                {popupBlocked && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Pop-up was blocked. Allow pop-ups for this site, then open the window again.
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openDeviceWindow()}
                    disabled={!url}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-50"
                  >
                    {windowOpened ? 'Reopen / focus window' : 'Open device window'}
                  </button>
                  {windowOpened && (
                    <button
                      type="button"
                      onClick={closePreviewWindow}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      Close window
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="relative"
              style={{
                width: (size.width + (isWatch ? 24 : 0)) * scale,
                height: size.height * scale,
              }}
            >
              {isWatch && (
                <>
                  <div
                    className={`absolute z-20 pointer-events-none bg-slate-600 dark:bg-slate-500 shadow ${
                      isRoundWatch ? 'rounded-md' : 'rounded-full'
                    }`}
                    style={{
                      top: isRoundWatch ? '28%' : '33%',
                      right: 0,
                      width: (isRoundWatch ? 8 : 10) * scale,
                      height: (isRoundWatch ? 22 : 28) * scale,
                      transform: 'translateX(45%)',
                    }}
                    aria-hidden
                  />
                  {isRoundWatch && (
                    <div
                      className="absolute z-20 pointer-events-none rounded-md bg-slate-500 dark:bg-slate-400 shadow"
                      style={{
                        top: '48%',
                        right: 0,
                        width: 7 * scale,
                        height: 14 * scale,
                        transform: 'translateX(40%)',
                      }}
                      aria-hidden
                    />
                  )}
                </>
              )}

              <div
                className={`absolute top-0 left-0 origin-top-left bg-slate-900 dark:bg-slate-950 shadow-xl ${outerRadiusClass} ${
                  isRoundWatch ? 'ring-2 ring-slate-700/80' : ''
                }`}
                style={{
                  width: size.width,
                  height: size.height,
                  transform: `scale(${scale})`,
                  padding: bezelPadding,
                }}
              >
                {!isWatch && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                    {isPhone ? (
                      <div className="w-24 h-5 bg-slate-900 rounded-full border border-slate-700/80" />
                    ) : (
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full" />
                    )}
                  </div>
                )}

                <div className={`relative z-0 w-full h-full overflow-hidden bg-white ${innerRadiusClass}`}>
                  {url && allowIframeMount && !iframeBlocked ? (
                    <iframe
                      ref={iframeRef}
                      key={`${url}-${device}-${watchShape}`}
                      src={url}
                      title={`Mobile preview: ${plainLabel || displayUrl}`}
                      className={`w-full h-full border-0 bg-white ${isRoundWatch ? 'rounded-full' : ''}`}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                      referrerPolicy="no-referrer"
                      onLoad={handleIframeLoad}
                      onError={handleIframeError}
                    />
                  ) : !url ? (
                    <div className="flex items-center justify-center h-full text-sm text-slate-500">
                      No URL to preview
                    </div>
                  ) : null}

                  {iframeLoading && url && !iframeBlocked && (
                    <div className={`absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/70 pointer-events-none ${innerRadiusClass}`}>
                      <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-300">
                        <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-xs">Checking if this site allows in-app preview…</span>
                      </div>
                    </div>
                  )}

                  {iframeBlocked && url && (
                    <div className={`absolute inset-0 z-20 flex items-center justify-center bg-white dark:bg-slate-900 p-3 sm:p-5 overflow-auto ${innerRadiusClass}`}>
                      <div className={`text-center space-y-3 ${isWatch ? 'max-w-none px-1 space-y-2' : 'max-w-sm'}`}>
                        <div className={`mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center justify-center ${isWatch ? 'w-8 h-8' : 'w-12 h-12'}`}>
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={isWatch ? 'w-4 h-4' : 'w-6 h-6'}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                        </div>
                        <p className={`font-semibold text-slate-800 dark:text-slate-100 ${isWatch ? 'text-[10px] leading-tight' : 'text-sm'}`}>
                          This site can’t be previewed in-app
                        </p>
                        {!isWatch && (
                          <>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                              {blockReason || 'The site blocks iframe embedding (for example X-Frame-Options or CSP).'}
                              {' '}Try <span className="font-medium text-slate-700 dark:text-slate-200">Device emulation</span> instead — it opens a real browser window at this device size.
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate" title={url}>
                              {displayUrl}
                            </p>
                          </>
                        )}
                        <div className={`flex flex-wrap items-center justify-center gap-2 ${isWatch ? '' : 'pt-1'}`}>
                          <button
                            type="button"
                            onClick={switchToEmulationMode}
                            className={`inline-flex items-center justify-center font-medium rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors ${
                              isWatch ? 'px-2 py-1 text-[9px]' : 'px-3.5 py-2 text-xs'
                            }`}
                          >
                            Try Device emulation
                          </button>
                          <button
                            type="button"
                            onClick={openInNewTab}
                            className={`inline-flex items-center justify-center font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                              isWatch ? 'px-2 py-1 text-[9px]' : 'px-3 py-2 text-xs'
                            }`}
                          >
                            New tab
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Round-watch foreground bezel: sits above the screen so clipped corners look like rim, not broken UI */}
                {isRoundWatch && (
                  <div
                    className="absolute inset-0 rounded-full pointer-events-none z-40"
                    style={{
                      boxShadow:
                        'inset 0 0 0 16px #0f172a, inset 0 0 0 18px rgba(100,116,139,0.55), inset 0 0 18px 2px rgba(0,0,0,0.45)',
                    }}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
            {isEmulationMode ? 'Device emulation' : 'In-app'} · {size.label} · {size.width}×{size.height}
            {isEmulationMode ? ` · zoom ${zoomPercent}%` : scale < 0.99 || scale > 1.01 ? ` · scaled ${Math.round(scale * 100)}%` : ''}
          </p>
          <div className="flex items-center gap-2">
            {isEmulationMode ? (
              <button
                type="button"
                onClick={() => openDeviceWindow()}
                disabled={!url}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-50"
              >
                Open device window
              </button>
            ) : (
              <button
                type="button"
                onClick={switchToEmulationMode}
                disabled={!url}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                title="Open sized browser window and use DevTools device mode"
              >
                Device emulation
              </button>
            )}
            <button
              type="button"
              onClick={openInNewTab}
              disabled={!url}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              Open in new tab
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
