import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDisplayUrl } from '../utils/urlDisplay';
import { DeviceMockupFrame, type DeviceMockupVariant } from './DeviceMockupFrame';

type PreviewMode = 'in-app' | 'emulation';

interface MobilePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  label: string;
}

interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  variant: DeviceMockupVariant;
  group: 'Responsive' | 'iPhone' | 'Android' | 'Tablet' | 'Watch';
}

/** Shared presets for In-app mockups + Device emulation windows. */
const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'responsive', label: 'Responsive', width: 543, height: 1006, variant: 'android', group: 'Responsive' },
  { id: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, variant: 'iphone-legacy', group: 'iPhone' },
  { id: 'iphone-14', label: 'iPhone 14', width: 390, height: 844, variant: 'iphone-notch', group: 'iPhone' },
  { id: 'iphone-15-pro', label: 'iPhone 15 Pro', width: 393, height: 852, variant: 'iphone-island', group: 'iPhone' },
  { id: 'iphone-16-pro', label: 'iPhone 16 Pro', width: 402, height: 874, variant: 'iphone-island', group: 'iPhone' },
  { id: 'pixel-7', label: 'Pixel 7', width: 412, height: 915, variant: 'android', group: 'Android' },
  { id: 'pixel-8', label: 'Pixel 8', width: 412, height: 915, variant: 'android', group: 'Android' },
  { id: 'pixel-9', label: 'Pixel 9', width: 412, height: 924, variant: 'android', group: 'Android' },
  { id: 'galaxy-s24', label: 'Galaxy S24', width: 360, height: 780, variant: 'android', group: 'Android' },
  { id: 'ipad', label: 'iPad', width: 820, height: 1180, variant: 'ipad', group: 'Tablet' },
  { id: 'android-tablet', label: 'Android Tablet', width: 800, height: 1280, variant: 'android-tablet', group: 'Tablet' },
  { id: 'watch-square', label: 'Watch (Square)', width: 198, height: 242, variant: 'watch-square', group: 'Watch' },
  { id: 'watch-round', label: 'Watch (Round)', width: 360, height: 360, variant: 'watch-round', group: 'Watch' },
];

const QUICK_PRESETS = ['iphone-14', 'iphone-15-pro', 'pixel-7', 'pixel-8', 'galaxy-s24', 'ipad', 'watch-square', 'watch-round'] as const;

const PRESET_GROUPS = ['Responsive', 'iPhone', 'Android', 'Tablet', 'Watch'] as const;

const ZOOM_OPTIONS = [25, 50, 75, 100, 125, 150];
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
    if (!res.ok) return { embeddable: null, reason: null };
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

function findPreset(id: string): DevicePreset {
  return DEVICE_PRESETS.find((p) => p.id === id) || DEVICE_PRESETS[1];
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
  const [previewMode, setPreviewMode] = useState<PreviewMode>('in-app');
  const [presetId, setPresetId] = useState('iphone-14');
  const [viewWidth, setViewWidth] = useState(390);
  const [viewHeight, setViewHeight] = useState(844);
  const [zoomPercent, setZoomPercent] = useState(50);
  const [fitScale, setFitScale] = useState(1);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [allowIframeMount, setAllowIframeMount] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [windowOpened, setWindowOpened] = useState(false);
  const loadGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const plainLabel = useMemo(() => stripHtmlTags(label || ''), [label]);

  const isEmulationMode = previewMode === 'emulation';
  const emulateShortcut = isMacPlatform() ? '⌘ + Shift + M' : 'Ctrl + Shift + M';
  const activePreset = findPreset(presetId);
  const isWatch = activePreset.group === 'Watch';
  const size = useMemo(
    () => ({ width: viewWidth, height: viewHeight, label: activePreset.label }),
    [viewWidth, viewHeight, activePreset.label]
  );

  const applyPreset = useCallback((id: string) => {
    const preset = findPreset(id);
    setPresetId(preset.id);
    setViewWidth(preset.width);
    setViewHeight(preset.height);
  }, []);

  const markResponsiveIfNeeded = useCallback((nextW: number, nextH: number) => {
    const match = DEVICE_PRESETS.find(
      (p) => p.id !== 'responsive' && p.width === nextW && p.height === nextH
    );
    setPresetId(match ? match.id : 'responsive');
  }, []);

  const rotateViewport = useCallback(() => {
    const nextW = viewHeight;
    const nextH = viewWidth;
    setViewWidth(nextW);
    setViewHeight(nextH);
    markResponsiveIfNeeded(nextW, nextH);
  }, [viewWidth, viewHeight, markResponsiveIfNeeded]);

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

  const updateFitScale = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || isEmulationMode) return;
    const padding = 32;
    const availableWidth = Math.max(120, stage.clientWidth - padding);
    const availableHeight = Math.max(120, stage.clientHeight - padding);
    const frameExtra = isWatch ? 40 : 36;
    const frameWidth = size.width + frameExtra;
    const frameHeight = size.height + frameExtra + (activePreset.variant === 'iphone-legacy' ? 18 : 0);
    const nextScale = Math.min(1, availableWidth / frameWidth, availableHeight / frameHeight);
    const maxScale = isWatch ? 1.75 : 1;
    setFitScale(Math.min(maxScale, Math.max(0.2, nextScale)));
  }, [isEmulationMode, isWatch, size.height, size.width, activePreset.variant]);

  useEffect(() => {
    if (!isOpen) return;

    dialogRef.current?.focus();
    setPreviewMode('in-app');
    setPresetId('iphone-14');
    setViewWidth(390);
    setViewHeight(844);
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
    updateFitScale();
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateFitScale);
      return () => window.removeEventListener('resize', updateFitScale);
    }
    const observer = new ResizeObserver(() => updateFitScale());
    observer.observe(stage);
    window.addEventListener('resize', updateFitScale);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateFitScale);
    };
  }, [isOpen, updateFitScale]);

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

      setAllowIframeMount(true);
      loadGuardRef.current = setTimeout(() => {
        if (!cancelled) setIframeLoading(false);
      }, 6000);
    })();

    return () => {
      cancelled = true;
      if (loadGuardRef.current) clearTimeout(loadGuardRef.current);
    };
  }, [isOpen, url, presetId, isEmulationMode]);

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
  const emuPreviewScale = zoomPercent / 100;
  const screenScale = isEmulationMode ? emuPreviewScale : fitScale;

  const handleIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    if (loadGuardRef.current) clearTimeout(loadGuardRef.current);
    setIframeLoading(false);
    const frame = e.currentTarget;
    if (looksLikeEmbedBlock(frame)) {
      setIframeBlocked(true);
      setBlockReason('This site refused to connect inside the preview (iframe blocked)');
      return;
    }
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

  const inputClass =
    'h-7 px-2 text-xs rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

  const screenContent = (
    <div className="relative w-full h-full overflow-hidden bg-white">
      {!isEmulationMode && url && allowIframeMount && !iframeBlocked ? (
        <iframe
          ref={iframeRef}
          key={`${url}-${presetId}-${viewWidth}x${viewHeight}`}
          src={url}
          title={`Mobile preview: ${plainLabel || displayUrl}`}
          className="absolute inset-0 w-full h-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
        />
      ) : !isEmulationMode && !url ? (
        <div className="flex items-center justify-center h-full text-sm text-slate-500">
          No URL to preview
        </div>
      ) : isEmulationMode ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 w-full h-full">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {size.label}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {size.width} × {size.height}
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-[14rem] leading-relaxed">
            Open the device window, then use DevTools device mode ({emulateShortcut}).
          </p>
        </div>
      ) : null}

      {!isEmulationMode && iframeLoading && url && !iframeBlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/85 dark:bg-slate-900/75 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-slate-500 dark:text-slate-300">
            <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs">Checking if this site allows in-app preview…</span>
          </div>
        </div>
      )}

      {!isEmulationMode && iframeBlocked && url && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white dark:bg-slate-900 p-4 overflow-auto">
          <div className={`text-center space-y-3 ${isWatch ? 'px-1 space-y-2' : 'max-w-sm'}`}>
            <p className={`font-semibold text-slate-800 dark:text-slate-100 ${isWatch ? 'text-[10px]' : 'text-sm'}`}>
              This site can’t be previewed in-app
            </p>
            {!isWatch && (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {blockReason || 'The site blocks iframe embedding.'}{' '}
                Try <span className="font-medium text-slate-700 dark:text-slate-200">Device emulation</span> instead.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
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
  );

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
                title="Sized browser window + DevTools device mode"
              >
                Device emulation
              </button>
            </div>

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

        {/* DevTools-style / device toolbar */}
        <div className="px-3 sm:px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex flex-wrap items-center gap-2 shrink-0">
          <select
            className={`${inputClass} min-w-[10rem]`}
            value={presetId}
            onChange={(e) => applyPreset(e.target.value)}
            aria-label="Device preset"
          >
            {PRESET_GROUPS.map((group) => (
              <optgroup key={group} label={group}>
                {DEVICE_PRESETS.filter((p) => p.group === group).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <div className="inline-flex items-center gap-1">
            <input
              type="number"
              min={120}
              max={4096}
              value={viewWidth}
              onChange={(e) => {
                const next = clampDim(Number(e.target.value));
                setViewWidth(next);
                markResponsiveIfNeeded(next, viewHeight);
              }}
              className={`${inputClass} w-[4.5rem]`}
              aria-label="Viewport width"
            />
            <span className="text-xs text-slate-400">×</span>
            <input
              type="number"
              min={120}
              max={4096}
              value={viewHeight}
              onChange={(e) => {
                const next = clampDim(Number(e.target.value));
                setViewHeight(next);
                markResponsiveIfNeeded(viewWidth, next);
              }}
              className={`${inputClass} w-[4.5rem]`}
              aria-label="Viewport height"
            />
          </div>

          {isEmulationMode && (
            <select
              className={`${inputClass} w-[4.75rem]`}
              value={zoomPercent}
              onChange={(e) => setZoomPercent(Number(e.target.value))}
              aria-label="Preview zoom"
            >
              {ZOOM_OPTIONS.map((z) => (
                <option key={z} value={z}>
                  {z}%
                </option>
              ))}
            </select>
          )}

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

          <div className="hidden md:flex flex-wrap items-center gap-1">
            {QUICK_PRESETS.map((id) => {
              const p = findPreset(id);
              const active = presetId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyPreset(id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                    active
                      ? 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-900 dark:text-white shadow-sm'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-white/70 dark:hover:bg-slate-800'
                  }`}
                  title={`${p.label} (${p.width}×${p.height})`}
                >
                  {p.label
                    .replace('iPhone ', 'iP ')
                    .replace('Galaxy ', 'S')
                    .replace('Watch (Square)', 'Watch □')
                    .replace('Watch (Round)', 'Watch ○')}
                </button>
              );
            })}
          </div>

          <div className="flex-1" />

          {isEmulationMode && (
            <button
              type="button"
              onClick={() => openDeviceWindow()}
              disabled={!url}
              className="h-7 px-3 text-xs font-medium rounded-md bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-50"
            >
              {windowOpened ? 'Focus window' : 'Open window'}
            </button>
          )}
        </div>

        <div
          ref={stageRef}
          className="flex-1 min-h-0 overflow-auto bg-slate-100 dark:bg-slate-900/60 flex items-start justify-center p-4"
        >
          <div className="flex flex-col items-center gap-4 py-2 w-full">
            <DeviceMockupFrame
              variant={activePreset.variant}
              width={viewWidth}
              height={viewHeight}
              scale={screenScale}
            >
              {screenContent}
            </DeviceMockupFrame>

            {isEmulationMode && (
              <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-left space-y-2">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  Use the browser like DevTools ({size.label})
                </p>
                <ol className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>
                    Click <span className="font-medium text-slate-700 dark:text-slate-200">Open window</span> to load the real site at {size.width}×{size.height}.
                  </li>
                  <li>
                    Open DevTools (<span className="font-mono text-[11px]">F12</span>), then press{' '}
                    <kbd className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 font-mono text-[11px]">
                      {emulateShortcut}
                    </kbd>{' '}
                    for device emulation.
                  </li>
                  <li>
                    Match Dimensions to <span className="font-medium">{size.label}</span> or pick the same device in DevTools.
                  </li>
                </ol>
                {popupBlocked && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    Pop-up was blocked. Allow pop-ups for this site, then open again.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
            {isEmulationMode ? 'Device emulation' : 'In-app mockup'} · {size.label} · {size.width}×{size.height}
            {isEmulationMode ? ` · zoom ${zoomPercent}%` : ` · fit ${Math.round(fitScale * 100)}%`}
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
