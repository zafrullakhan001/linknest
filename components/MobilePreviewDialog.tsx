import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDisplayUrl } from '../utils/urlDisplay';
import { DeviceMockupFrame, isZebraVariant, type DeviceMockupVariant } from './DeviceMockupFrame';

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
  group: 'Responsive' | 'iPhone' | 'Android' | 'Tablet' | 'Watch' | 'Enterprise';
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
  // Zebra enterprise — portrait CSS viewports (width × height)
  { id: 'zebra-tc21', label: 'Zebra TC21 · HD (720×1280)', width: 720, height: 1280, variant: 'zebra-handheld', group: 'Enterprise' },
  { id: 'zebra-tc52', label: 'Zebra TC52 · HD (720×1280)', width: 720, height: 1280, variant: 'zebra-tc52ax', group: 'Enterprise' },
  { id: 'zebra-tc52ax', label: 'Zebra TC52ax · HD (720×1280)', width: 720, height: 1280, variant: 'zebra-tc52ax', group: 'Enterprise' },
  { id: 'zebra-tc57', label: 'Zebra TC57 · HD (720×1280)', width: 720, height: 1280, variant: 'zebra-tc52ax', group: 'Enterprise' },
  { id: 'zebra-tc58', label: 'Zebra TC58 · Full HD (1080×2160)', width: 1080, height: 2160, variant: 'zebra-tc58', group: 'Enterprise' },
  { id: 'zebra-tc73', label: 'Zebra TC73 · Full HD+ (1080×2160)', width: 1080, height: 2160, variant: 'zebra-tc73', group: 'Enterprise' },
  { id: 'zebra-mc3300', label: 'Zebra MC3300 (480×800)', width: 480, height: 800, variant: 'zebra-mc3300', group: 'Enterprise' },
  { id: 'zebra-mc3300-768', label: 'Zebra MC3300 (480×768)', width: 480, height: 768, variant: 'zebra-mc3300', group: 'Enterprise' },
  { id: 'zebra-mc9300', label: 'Zebra MC9300 (480×800)', width: 480, height: 800, variant: 'zebra-mc9300', group: 'Enterprise' },
  { id: 'zebra-et51', label: 'Zebra ET51 · WUXGA (1920×1200)', width: 1920, height: 1200, variant: 'zebra-et51', group: 'Enterprise' },
  { id: 'zebra-et60', label: 'Zebra ET60 · WUXGA (1920×1200)', width: 1920, height: 1200, variant: 'zebra-et60', group: 'Enterprise' },
];

const QUICK_PRESETS = [
  'iphone-14',
  'iphone-15-pro',
  'pixel-7',
  'pixel-8',
  'galaxy-s24',
  'ipad',
  'zebra-tc73',
  'zebra-et60',
  'watch-square',
  'watch-round',
] as const;

const PRESET_GROUPS = ['Responsive', 'iPhone', 'Android', 'Tablet', 'Enterprise', 'Watch'] as const;

const ZOOM_OPTIONS = [25, 50, 75, 100, 125, 150];
const PREVIEW_WINDOW_NAME = 'linknest_device_preview';
const DIALOG_POS_KEY = 'linknest.mobilePreviewDialog.position.v1';
const DIALOG_SIZE_KEY = 'linknest.mobilePreviewDialog.size.v1';
const DIALOG_MIN_W = 520;
const DIALOG_MIN_H = 420;
const DIALOG_MAX_W = 1600;
const DIALOG_MAX_H = 1200;
const DIALOG_MIN_VISIBLE = 64;

type DialogPoint = { x: number; y: number };
type DialogSize = { width: number; height: number };

function clampNum(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getCssZoom(): number {
  const raw = getComputedStyle(document.documentElement).zoom;
  const z = raw && raw !== 'normal' ? Number.parseFloat(raw) : 1;
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function getViewportSize() {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

function safeParsePoint(raw: string | null): DialogPoint | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.x === 'number' &&
      typeof parsed.y === 'number' &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // ignore
  }
  return null;
}

function safeParseSize(raw: string | null): DialogSize | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.width === 'number' &&
      typeof parsed.height === 'number' &&
      Number.isFinite(parsed.width) &&
      Number.isFinite(parsed.height)
    ) {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    // ignore
  }
  return null;
}

function defaultDialogSize(): DialogSize {
  const { width: vvW, height: vvH } = getViewportSize();
  const zoom = getCssZoom();
  const layoutW = vvW / zoom;
  const layoutH = vvH / zoom;
  return {
    width: clampNum(Math.min(1024, layoutW - 48), DIALOG_MIN_W, Math.min(DIALOG_MAX_W, layoutW - 24)),
    height: clampNum(Math.min(860, layoutH - 48), DIALOG_MIN_H, Math.min(DIALOG_MAX_H, layoutH - 24)),
  };
}

function centeredDialogPos(size: DialogSize): DialogPoint {
  const { width: vvW, height: vvH } = getViewportSize();
  const zoom = getCssZoom();
  const layoutW = vvW / zoom;
  const layoutH = vvH / zoom;
  return {
    x: Math.max(12, Math.round((layoutW - size.width) / 2)),
    y: Math.max(12, Math.round((layoutH - size.height) / 2)),
  };
}

function clampDialogPos(p: DialogPoint, size: DialogSize): DialogPoint {
  const { width: vvW, height: vvH } = getViewportSize();
  const zoom = getCssZoom();
  const layoutW = vvW / zoom;
  const layoutH = vvH / zoom;
  return {
    x: clampNum(p.x, -size.width + DIALOG_MIN_VISIBLE, layoutW - DIALOG_MIN_VISIBLE),
    y: clampNum(p.y, -size.height + DIALOG_MIN_VISIBLE, layoutH - DIALOG_MIN_VISIBLE),
  };
}

function clampDialogSize(size: DialogSize): DialogSize {
  const { width: vvW, height: vvH } = getViewportSize();
  const zoom = getCssZoom();
  const layoutW = vvW / zoom;
  const layoutH = vvH / zoom;
  return {
    width: clampNum(size.width, DIALOG_MIN_W, Math.min(DIALOG_MAX_W, Math.max(DIALOG_MIN_W, layoutW - 16))),
    height: clampNum(size.height, DIALOG_MIN_H, Math.min(DIALOG_MAX_H, Math.max(DIALOG_MIN_H, layoutH - 16))),
  };
}

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
  const panelRef = useRef<HTMLDivElement>(null);
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
  const [dialogSize, setDialogSize] = useState<DialogSize>(() => {
    return safeParseSize(localStorage.getItem(DIALOG_SIZE_KEY)) || defaultDialogSize();
  });
  const [dialogPos, setDialogPos] = useState<DialogPoint>(() => {
    const size = safeParseSize(localStorage.getItem(DIALOG_SIZE_KEY)) || defaultDialogSize();
    return safeParsePoint(localStorage.getItem(DIALOG_POS_KEY)) || centeredDialogPos(size);
  });
  const [isDraggingDialog, setIsDraggingDialog] = useState(false);
  const [isResizingDialog, setIsResizingDialog] = useState(false);
  const loadGuardRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const dialogPosRef = useRef(dialogPos);
  const dialogSizeRef = useRef(dialogSize);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const resizeStartRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    posX: number;
    posY: number;
    direction: string;
  } | null>(null);
  const plainLabel = useMemo(() => stripHtmlTags(label || ''), [label]);

  useEffect(() => {
    dialogPosRef.current = dialogPos;
  }, [dialogPos]);

  useEffect(() => {
    dialogSizeRef.current = dialogSize;
  }, [dialogSize]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  const persistDialogLayout = useCallback((pos: DialogPoint, size: DialogSize) => {
    try {
      localStorage.setItem(DIALOG_POS_KEY, JSON.stringify(pos));
      localStorage.setItem(DIALOG_SIZE_KEY, JSON.stringify(size));
    } catch {
      // ignore storage failures
    }
  }, []);

  const startDialogDrag = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'button, a, input, select, textarea, [role="button"], [role="group"], [data-no-drag]'
        )
      ) {
        return;
      }

      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        posX: dialogPosRef.current.x,
        posY: dialogPosRef.current.y,
      };
      setIsDraggingDialog(true);

      const onMove = (ev: PointerEvent) => {
        const start = dragStartRef.current;
        if (!start) return;
        const zoom = getCssZoom();
        const next = clampDialogPos(
          {
            x: start.posX + (ev.clientX - start.x) / zoom,
            y: start.posY + (ev.clientY - start.y) / zoom,
          },
          dialogSizeRef.current
        );
        dialogPosRef.current = next;
        setDialogPos(next);
      };

      const onUp = () => {
        dragCleanupRef.current?.();
        dragCleanupRef.current = null;
        dragStartRef.current = null;
        setIsDraggingDialog(false);
        persistDialogLayout(dialogPosRef.current, dialogSizeRef.current);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
      dragCleanupRef.current = () => {
        window.removeEventListener('pointermove', onMove);
      };

      e.preventDefault();
    },
    [persistDialogLayout]
  );

  const startDialogResize = useCallback(
    (e: React.PointerEvent, direction: string) => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: dialogSizeRef.current.width,
        height: dialogSizeRef.current.height,
        posX: dialogPosRef.current.x,
        posY: dialogPosRef.current.y,
        direction,
      };
      setIsResizingDialog(true);

      const onMove = (ev: PointerEvent) => {
        const start = resizeStartRef.current;
        if (!start) return;
        const zoom = getCssZoom();
        const dx = (ev.clientX - start.x) / zoom;
        const dy = (ev.clientY - start.y) / zoom;

        let newWidth = start.width;
        let newHeight = start.height;
        let newX = start.posX;
        let newY = start.posY;

        if (direction.includes('e')) {
          newWidth = start.width + dx;
        }
        if (direction.includes('w')) {
          newWidth = start.width - dx;
        }
        if (direction.includes('s')) {
          newHeight = start.height + dy;
        }
        if (direction.includes('n')) {
          newHeight = start.height - dy;
        }

        const nextSize = clampDialogSize({ width: newWidth, height: newHeight });
        if (direction.includes('w')) {
          newX = start.posX + (start.width - nextSize.width);
        }
        if (direction.includes('n')) {
          newY = start.posY + (start.height - nextSize.height);
        }

        const nextPos = clampDialogPos({ x: newX, y: newY }, nextSize);
        dialogSizeRef.current = nextSize;
        dialogPosRef.current = nextPos;
        setDialogSize(nextSize);
        setDialogPos(nextPos);
      };

      const onUp = () => {
        dragCleanupRef.current?.();
        dragCleanupRef.current = null;
        resizeStartRef.current = null;
        setIsResizingDialog(false);
        persistDialogLayout(dialogPosRef.current, dialogSizeRef.current);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
      dragCleanupRef.current = () => {
        window.removeEventListener('pointermove', onMove);
      };

      e.preventDefault();
      e.stopPropagation();
    },
    [persistDialogLayout]
  );

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
    const isZebra = isZebraVariant(activePreset.variant);
    const isMc = activePreset.variant === 'zebra-mc3300' || activePreset.variant === 'zebra-mc9300';
    const isEt = activePreset.variant === 'zebra-et51' || activePreset.variant === 'zebra-et60';
    const frameExtra = isWatch ? 40 : isZebra ? 44 : 36;
    const frameWidth = size.width + frameExtra + (isZebra ? 18 : 0);
    const frameHeight =
      size.height +
      frameExtra +
      (activePreset.variant === 'iphone-legacy' ? 18 : 0) +
      (isMc ? 170 : isEt ? 50 : isZebra ? 64 : 0);
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

    const nextSize = clampDialogSize(
      safeParseSize(localStorage.getItem(DIALOG_SIZE_KEY)) || dialogSizeRef.current || defaultDialogSize()
    );
    const storedPos = safeParsePoint(localStorage.getItem(DIALOG_POS_KEY));
    const nextPos = clampDialogPos(storedPos || centeredDialogPos(nextSize), nextSize);
    dialogSizeRef.current = nextSize;
    dialogPosRef.current = nextPos;
    setDialogSize(nextSize);
    setDialogPos(nextPos);

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const clampToViewport = () => {
      const size = clampDialogSize(dialogSizeRef.current);
      const pos = clampDialogPos(dialogPosRef.current, size);
      dialogSizeRef.current = size;
      dialogPosRef.current = pos;
      setDialogSize(size);
      setDialogPos(pos);
    };

    window.addEventListener('keydown', handleEscKey, true);
    window.addEventListener('resize', clampToViewport);
    window.visualViewport?.addEventListener('resize', clampToViewport);
    return () => {
      window.removeEventListener('keydown', handleEscKey, true);
      window.removeEventListener('resize', clampToViewport);
      window.visualViewport?.removeEventListener('resize', clampToViewport);
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
    'h-7 px-2 text-xs rounded-lg border border-sky-200/70 dark:border-sky-800/40 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400';

  const primaryBtnClass =
    'inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors shadow-sm shadow-sky-500/20 disabled:opacity-50 disabled:cursor-not-allowed';
  const secondaryBtnClass =
    'inline-flex items-center justify-center gap-1.5 font-medium rounded-lg border border-sky-200/70 dark:border-sky-700/40 text-sky-900 dark:text-sky-100 bg-white/80 dark:bg-slate-900/40 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors disabled:opacity-50';

  const quickPresetEmoji = (id: string): string => {
    if (id.startsWith('iphone')) return '📱';
    if (id.startsWith('pixel') || id.startsWith('galaxy')) return '🤖';
    if (id === 'ipad') return '📲';
    if (id.startsWith('zebra-et')) return '🖥️';
    if (id.startsWith('zebra-mc')) return '⌨️';
    if (id.startsWith('zebra')) return '📦';
    if (id === 'watch-square') return '⌚️';
    if (id === 'watch-round') return '⭕';
    return '🖥️';
  };

  const quickPresetShortLabel = (preset: DevicePreset): string => {
    if (preset.id === 'zebra-tc73') return 'TC73';
    if (preset.id === 'zebra-et60') return 'ET60';
    return preset.label
      .replace(/\s*\(\d+×\d+\)\s*$/, '')
      .replace('iPhone ', 'iP ')
      .replace('Galaxy ', 'S')
      .replace('Zebra TC52', 'Zebra')
      .replace('Watch (Square)', 'Watch □')
      .replace('Watch (Round)', 'Watch ○');
  };

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
        <div className="flex flex-col items-center justify-center gap-2 h-full text-sm text-sky-700 dark:text-sky-300">
          <span className="text-2xl" aria-hidden>
            🔗
          </span>
          No URL to preview
        </div>
      ) : isEmulationMode ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center bg-gradient-to-b from-sky-50 to-teal-50/60 dark:from-sky-950/40 dark:to-teal-950/30 w-full h-full">
          <p className="text-2xl" aria-hidden>
            🧭
          </p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{size.label}</p>
          <p className="text-xs text-sky-800/70 dark:text-sky-200/70">
            {size.width} × {size.height}
          </p>
          <p className="text-[11px] text-sky-700/70 dark:text-sky-300/70 max-w-[14rem] leading-relaxed">
            Open the device window, then use DevTools device mode ({emulateShortcut}).
          </p>
        </div>
      ) : null}

      {!isEmulationMode && iframeLoading && url && !iframeBlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-sky-50/90 dark:bg-sky-950/70 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-sky-700 dark:text-sky-300">
            <svg className="animate-spin h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-xs">
              <span aria-hidden>🔍</span> Checking if this site allows in-app preview…
            </span>
          </div>
        </div>
      )}

      {!isEmulationMode && iframeBlocked && url && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-b from-sky-50 to-white dark:from-sky-950/50 dark:to-slate-900 p-4 overflow-auto">
          <div className={`text-center space-y-3 ${isWatch ? 'px-1 space-y-2' : 'max-w-sm'}`}>
            <p className="text-2xl" aria-hidden>
              🚧
            </p>
            <p className={`font-semibold text-slate-800 dark:text-slate-100 ${isWatch ? 'text-[10px]' : 'text-sm'}`}>
              This site can’t be previewed in-app
            </p>
            {!isWatch && (
              <p className="text-xs text-sky-800/70 dark:text-sky-200/70 leading-relaxed">
                {blockReason || 'The site blocks iframe embedding.'} Try{' '}
                <span className="font-medium text-sky-900 dark:text-sky-100">Device emulation</span> instead.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={switchToEmulationMode}
                className={`${primaryBtnClass} ${isWatch ? 'px-2 py-1 text-[9px]' : 'px-3.5 py-2 text-xs'}`}
              >
                <span aria-hidden>🖥️</span> Try Device emulation
              </button>
              <button
                type="button"
                onClick={openInNewTab}
                className={`${secondaryBtnClass} ${isWatch ? 'px-2 py-1 text-[9px]' : 'px-3 py-2 text-xs'}`}
              >
                <span aria-hidden>↗</span> New tab
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
      className="fixed inset-0 z-[99999] bg-black/50 backdrop-blur-sm outline-none"
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
        ref={panelRef}
        className={`absolute bg-white dark:bg-slate-800 rounded-2xl shadow-2xl shadow-sky-500/10 border border-sky-200/70 dark:border-sky-800/40 flex flex-col overflow-hidden ${
          isDraggingDialog || isResizingDialog ? 'select-none' : ''
        }`}
        style={{
          left: dialogPos.x,
          top: dialogPos.y,
          width: dialogSize.width,
          height: dialogSize.height,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-4 sm:px-6 py-3.5 border-b border-sky-100 dark:border-sky-800/40 bg-gradient-to-r from-sky-50 via-teal-50/80 to-cyan-50/60 dark:from-sky-950/40 dark:via-teal-950/30 dark:to-cyan-950/20 flex flex-wrap items-center justify-between gap-3 shrink-0 ${
            isDraggingDialog ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={startDialogDrag}
          title="Drag to move"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="h-10 w-10 rounded-xl bg-gradient-to-br from-sky-500 to-teal-600 text-white shadow-md shadow-sky-500/25 flex items-center justify-center text-xl shrink-0"
              aria-hidden
            >
              📱
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-sky-700/80 dark:text-sky-300/80">
                Device preview
              </p>
              <h3
                id="mobile-preview-dialog-title"
                className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate"
                title={plainLabel}
              >
                {plainLabel || 'Mobile preview'}
              </h3>
              <p
                className="text-xs sm:text-sm text-sky-800/70 dark:text-sky-200/70 mt-0.5 truncate font-mono"
                title={url}
              >
                {displayUrl}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0" data-no-drag>
            <div
              className="inline-flex rounded-xl border border-sky-200/60 dark:border-sky-700/40 p-0.5 bg-white/70 dark:bg-slate-900/40"
              role="group"
              aria-label="Preview method"
            >
              <button
                type="button"
                onClick={() => setPreviewMode('in-app')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  !isEmulationMode
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/25'
                    : 'text-sky-800/80 dark:text-sky-200/80 hover:bg-sky-50 dark:hover:bg-sky-950/40'
                }`}
                aria-pressed={!isEmulationMode}
              >
                <span aria-hidden>🖼️</span> In-app
              </button>
              <button
                type="button"
                onClick={switchToEmulationMode}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  isEmulationMode
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-500/25'
                    : 'text-sky-800/80 dark:text-sky-200/80 hover:bg-sky-50 dark:hover:bg-sky-950/40'
                }`}
                aria-pressed={isEmulationMode}
                title="Sized browser window + DevTools device mode"
              >
                <span aria-hidden>🖥️</span> Device emulation
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/80 dark:hover:bg-slate-700 text-sky-700/70 dark:text-sky-300/70 hover:text-sky-900 dark:hover:text-sky-100 transition-colors"
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
        <div className="px-3 sm:px-4 py-2.5 border-b border-sky-100 dark:border-sky-800/40 bg-gradient-to-r from-sky-50/60 to-teal-50/40 dark:from-sky-950/20 dark:to-teal-950/10 flex flex-wrap items-center gap-2 shrink-0">
          <span className="text-sm leading-none" aria-hidden title="Device">
            📟
          </span>
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
            <span className="text-[11px] text-sky-700/70 dark:text-sky-300/70" aria-hidden>
              📐
            </span>
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
            <span className="text-xs text-sky-500">×</span>
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
            className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-sky-200/70 dark:border-sky-700/40 text-sky-700 dark:text-sky-300 hover:bg-white dark:hover:bg-sky-950/40 transition-colors"
            title="Rotate viewport"
            aria-label="Rotate viewport"
          >
            <span aria-hidden>🔄</span>
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
                  className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                    active
                      ? 'bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-500/25'
                      : 'border-sky-100 dark:border-sky-800/40 text-sky-800/80 dark:text-sky-200/80 hover:bg-white/80 dark:hover:bg-sky-950/40'
                  }`}
                  title={`${p.label} (${p.width}×${p.height})`}
                >
                  <span aria-hidden>{quickPresetEmoji(id)}</span>
                  {quickPresetShortLabel(p)}
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
              className={`h-7 px-3 text-xs ${primaryBtnClass}`}
            >
              <span aria-hidden>{windowOpened ? '🎯' : '🚀'}</span>
              {windowOpened ? 'Focus window' : 'Open window'}
            </button>
          )}
        </div>

        <div
          ref={stageRef}
          className="flex-1 min-h-0 overflow-auto bg-gradient-to-b from-sky-50/40 via-slate-50 to-teal-50/30 dark:from-sky-950/20 dark:via-slate-900/60 dark:to-teal-950/20 flex items-start justify-center p-4"
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
              <div className="w-full max-w-lg rounded-xl border border-sky-200/70 dark:border-sky-800/40 bg-gradient-to-br from-sky-50/70 to-white dark:from-sky-950/30 dark:to-slate-900/50 px-4 py-3 text-left space-y-2 shadow-sm shadow-sky-500/5">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <span aria-hidden>💡</span>
                  Use the browser like DevTools ({size.label})
                </p>
                <ol className="text-xs text-sky-800/70 dark:text-sky-200/70 space-y-1.5 list-decimal list-inside leading-relaxed">
                  <li>
                    Click <span className="font-medium text-sky-900 dark:text-sky-100">Open window</span> to load the
                    real site at {size.width}×{size.height}.
                  </li>
                  <li>
                    Open DevTools (<span className="font-mono text-[11px]">F12</span>), then press{' '}
                    <kbd className="px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 font-mono text-[11px]">
                      {emulateShortcut}
                    </kbd>{' '}
                    for device emulation.
                  </li>
                  <li>
                    Match Dimensions to <span className="font-medium text-sky-900 dark:text-sky-100">{size.label}</span>{' '}
                    or pick the same device in DevTools.
                  </li>
                </ol>
                {popupBlocked && (
                  <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <span aria-hidden>⚠️</span> Pop-up was blocked. Allow pop-ups for this site, then open again.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-sky-100 dark:border-sky-900/40 bg-gradient-to-r from-sky-50/80 to-teal-50/50 dark:from-sky-950/30 dark:to-teal-950/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-sky-800/70 dark:text-sky-200/70 truncate flex items-center gap-1.5 min-w-0">
            <span aria-hidden>{isEmulationMode ? '🖥️' : '🖼️'}</span>
            <span className="truncate">
              {isEmulationMode ? 'Device emulation' : 'In-app mockup'} · {size.label} · {size.width}×{size.height}
              {isEmulationMode ? ` · zoom ${zoomPercent}%` : ` · fit ${Math.round(fitScale * 100)}%`}
            </span>
          </p>
          <div className="flex items-center gap-2">
            {isEmulationMode ? (
              <button
                type="button"
                onClick={() => openDeviceWindow()}
                disabled={!url}
                className={`px-3 py-2 text-sm ${primaryBtnClass}`}
              >
                <span aria-hidden>🚀</span> Open device window
              </button>
            ) : (
              <button
                type="button"
                onClick={switchToEmulationMode}
                disabled={!url}
                className={`px-3 py-2 text-sm ${secondaryBtnClass}`}
              >
                <span aria-hidden>🖥️</span> Device emulation
              </button>
            )}
            <button
              type="button"
              onClick={openInNewTab}
              disabled={!url}
              className={`px-3 py-2 text-sm ${secondaryBtnClass}`}
            >
              <span aria-hidden>↗</span> Open in new tab
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-sky-200/70 dark:border-sky-700/40 bg-white/80 dark:bg-slate-900/40 text-sky-900 dark:text-sky-100 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Resize handles */}
        <div
          className="absolute top-0 right-0 z-20 w-3.5 h-3.5 cursor-ne-resize"
          onPointerDown={(e) => startDialogResize(e, 'ne')}
          style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(14, 165, 233, 0.55) 50%)' }}
          aria-hidden
        />
        <div
          className="absolute bottom-0 right-0 z-20 w-3.5 h-3.5 cursor-se-resize"
          onPointerDown={(e) => startDialogResize(e, 'se')}
          style={{ background: 'linear-gradient(45deg, transparent 50%, rgba(14, 165, 233, 0.55) 50%)' }}
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-0 z-20 w-3.5 h-3.5 cursor-sw-resize"
          onPointerDown={(e) => startDialogResize(e, 'sw')}
          style={{ background: 'linear-gradient(-45deg, transparent 50%, rgba(14, 165, 233, 0.55) 50%)' }}
          aria-hidden
        />
        <div
          className="absolute top-0 left-0 z-20 w-3.5 h-3.5 cursor-nw-resize"
          onPointerDown={(e) => startDialogResize(e, 'nw')}
          style={{ background: 'linear-gradient(-135deg, transparent 50%, rgba(14, 165, 233, 0.55) 50%)' }}
          aria-hidden
        />
        <div
          className="absolute top-0 left-3 right-3 z-10 h-1.5 cursor-n-resize"
          onPointerDown={(e) => startDialogResize(e, 'n')}
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-3 right-3 z-10 h-1.5 cursor-s-resize"
          onPointerDown={(e) => startDialogResize(e, 's')}
          aria-hidden
        />
        <div
          className="absolute top-3 bottom-3 left-0 z-10 w-1.5 cursor-w-resize"
          onPointerDown={(e) => startDialogResize(e, 'w')}
          aria-hidden
        />
        <div
          className="absolute top-3 bottom-3 right-0 z-10 w-1.5 cursor-e-resize"
          onPointerDown={(e) => startDialogResize(e, 'e')}
          aria-hidden
        />
      </div>
    </div>,
    document.body
  );
};
