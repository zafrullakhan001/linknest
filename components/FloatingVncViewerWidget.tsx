import React, { useEffect, useMemo, useRef, useState } from 'react';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

const STORAGE_KEY = 'linknest.floatingVncViewerWidget.position.v1';
const SIZE_STORAGE_KEY = 'linknest.floatingVncViewerWidget.size.v1';
const MIN_VISIBLE = 48;
const MIN_WIDTH = 640;
const MIN_HEIGHT = 360;
const MAX_WIDTH = 1400;
const MAX_HEIGHT = 1000;
const FOOTER_DRAG_HEIGHT = 32;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getCssZoom(): number {
  // This app uses `html { zoom: ... }` via injected CSS; account for it in drag math.
  const raw = getComputedStyle(document.documentElement).zoom;
  const z = raw && raw !== 'normal' ? Number.parseFloat(raw) : 1;
  return Number.isFinite(z) && z > 0 ? z : 1;
}

function getVisualViewportSize() {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

function safeParseSize(raw: string | null): Size | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
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

function centerInViewport(width: number, height: number): Point {
  const zoom = getCssZoom();
  const { width: vvW, height: vvH } = getVisualViewportSize();
  const layoutViewportWidth = vvW / zoom;
  const layoutViewportHeight = vvH / zoom;
  return {
    x: Math.round(Math.max(8, (layoutViewportWidth - width) / 2)),
    y: Math.round(Math.max(12, (layoutViewportHeight - height) / 2)),
  };
}

export const FloatingVncViewerWidget: React.FC<{
  children: React.ReactNode;
  defaultPosition?: Point;
}> = ({ children, defaultPosition }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initialSize = useMemo<Size>(() => {
    const stored = safeParseSize(localStorage.getItem(SIZE_STORAGE_KEY));
    if (stored) {
      return {
        width: clamp(stored.width, MIN_WIDTH, MAX_WIDTH),
        height: clamp(stored.height, MIN_HEIGHT, MAX_HEIGHT),
      };
    }
    return { width: 720, height: 520 };
  }, []);

  const initialPos = useMemo<Point>(() => {
    if (defaultPosition) return defaultPosition;
    return centerInViewport(initialSize.width, initialSize.height);
  }, [defaultPosition, initialSize.height, initialSize.width]);

  const [pos, setPos] = useState<Point>(initialPos);
  const [size, setSize] = useState<Size>(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
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
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const latestPosRef = useRef<Point>(initialPos);
  const latestSizeRef = useRef<Size>(initialSize);
  const rafRef = useRef<number | null>(null);
  const pendingPosRef = useRef<Point | null>(null);

  const clampToViewport = (p: Point, forSize: Size = size): Point => {
    const width = forSize.width;
    const height = forSize.height;

    const zoom = getCssZoom();
    const { width: vvW, height: vvH } = getVisualViewportSize();
    const layoutViewportWidth = vvW / zoom;
    const layoutViewportHeight = vvH / zoom;

    // Keep enough of the window visible; footer drag bar stays reachable near the bottom edge.
    const minX = -width + MIN_VISIBLE;
    const maxX = layoutViewportWidth - MIN_VISIBLE;
    const minY = -(height - FOOTER_DRAG_HEIGHT);
    const maxY = layoutViewportHeight - MIN_VISIBLE;

    return {
      x: clamp(p.x, minX, maxX),
      y: clamp(p.y, minY, maxY),
    };
  };

  const setPosBatched = (next: Point) => {
    pendingPosRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const p = pendingPosRef.current;
      if (!p) return;
      pendingPosRef.current = null;
      latestPosRef.current = p;
      setPos(p);
    });
  };

  // Always center when the widget opens (mount), so a lost top handle never strands it.
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = containerRef.current;
      const width = el?.offsetWidth ?? size.width;
      const height = el?.offsetHeight ?? size.height;
      const centered = clampToViewport(centerInViewport(width, height), { width, height });
      latestPosRef.current = centered;
      setPos(centered);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(centered));
      } catch {
        // ignore storage failures
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep position valid if viewport changes
  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampToViewport(p));
      setSize((s) => ({
        width: clamp(s.width, MIN_WIDTH, MAX_WIDTH),
        height: clamp(s.height, MIN_HEIGHT, MAX_HEIGHT),
      }));
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup listeners on unmount just in case
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;

    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y };
    setIsDragging(true);

    const onMove = (ev: PointerEvent) => {
      const start = dragStartRef.current;
      if (!start) return;
      const zoom = getCssZoom();
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const next = clampToViewport({ x: start.posX + dx / zoom, y: start.posY + dy / zoom });
      setPosBatched(next);
    };

    const onUp = () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      dragStartRef.current = null;
      setIsDragging(false);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latestPosRef.current));
      } catch {
        // ignore storage failures
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
    };

    e.preventDefault();
    e.stopPropagation();
  };

  const startResize = (e: React.PointerEvent, direction: string) => {
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: pos.x,
      posY: pos.y,
      direction,
    };
    setIsResizing(true);

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
        newWidth = clamp(start.width + dx, MIN_WIDTH, MAX_WIDTH);
      }
      if (direction.includes('w')) {
        newWidth = clamp(start.width - dx, MIN_WIDTH, MAX_WIDTH);
        newX = start.posX + (start.width - newWidth);
      }
      if (direction.includes('s')) {
        newHeight = clamp(start.height + dy, MIN_HEIGHT, MAX_HEIGHT);
      }
      if (direction.includes('n')) {
        newHeight = clamp(start.height - dy, MIN_HEIGHT, MAX_HEIGHT);
        newY = start.posY + (start.height - newHeight);
      }

      const nextSize = { width: newWidth, height: newHeight };
      latestSizeRef.current = nextSize;
      setSize(nextSize);

      const newPos = clampToViewport({ x: newX, y: newY }, nextSize);
      latestPosRef.current = newPos;
      setPos(newPos);
    };

    const onUp = () => {
      resizeStartRef.current = null;
      setIsResizing(false);
      try {
        localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(latestSizeRef.current));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latestPosRef.current));
      } catch {
        // ignore storage failures
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });

    e.preventDefault();
    e.stopPropagation();
  };

  const grabClass = isDragging ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div
      ref={containerRef}
      className="linknest-overlay select-none"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.width,
        height: size.height,
        zIndex: 2147483647,
      }}
    >
      <div className="relative w-full h-full">
        {/* Top drag handle — sibling of overflow-hidden so the pill is not clipped */}
        <button
          type="button"
          className={`absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-16 h-7 rounded-full shadow-md border border-emerald-300/70 dark:border-emerald-600/60 bg-emerald-500/95 dark:bg-emerald-600/95 backdrop-blur flex items-center justify-center text-white ${grabClass}`}
          onPointerDown={startDrag}
          title="Drag VNC viewer"
          aria-label="Drag VNC viewer from top"
        >
          <span className="text-[16px] leading-none tracking-widest flex items-center">⋮⋮⋮</span>
        </button>

        <div className="relative w-full h-full flex flex-col rounded-xl overflow-hidden shadow-2xl">
        <div className="flex-1 min-h-0 overflow-hidden">{children}</div>

        {/* Footer drag bar — always reachable even if the top handle is off-screen */}
        <div
          role="button"
          tabIndex={0}
          className={`shrink-0 z-20 flex items-center justify-center gap-2 border-t border-emerald-400/40 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 text-white shadow-inner ${grabClass} ${
            isDragging ? 'brightness-110' : 'hover:brightness-105'
          }`}
          style={{ height: FOOTER_DRAG_HEIGHT }}
          onPointerDown={startDrag}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
          }}
          title="Drag VNC viewer from the footer"
          aria-label="Drag VNC viewer from footer"
        >
          <span className="text-[14px] leading-none tracking-widest opacity-90" aria-hidden>
            ⋮⋮⋮
          </span>
          <span className="text-[10px] font-semibold tracking-wide uppercase">
            {isDragging ? 'Moving…' : 'Drag to move'}
          </span>
          <span className="text-[14px] leading-none tracking-widest opacity-90" aria-hidden>
            ⋮⋮⋮
          </span>
        </div>

        {/* Resize handles */}
        <div
          className={`absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-30 ${isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'} transition-opacity`}
          onPointerDown={(e) => startResize(e, 'ne')}
          style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(16, 185, 129, 0.55) 50%)' }}
        />
        <div
          className={`absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-30 ${isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'} transition-opacity`}
          onPointerDown={(e) => startResize(e, 'se')}
          style={{ background: 'linear-gradient(45deg, transparent 50%, rgba(16, 185, 129, 0.55) 50%)' }}
        />
        <div
          className={`absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-30 ${isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'} transition-opacity`}
          onPointerDown={(e) => startResize(e, 'sw')}
          style={{ background: 'linear-gradient(-45deg, transparent 50%, rgba(16, 185, 129, 0.55) 50%)' }}
        />
        <div
          className={`absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-30 ${isResizing ? 'opacity-100' : 'opacity-0 hover:opacity-100'} transition-opacity`}
          onPointerDown={(e) => startResize(e, 'nw')}
          style={{ background: 'linear-gradient(-135deg, transparent 50%, rgba(16, 185, 129, 0.55) 50%)' }}
        />
        </div>
      </div>
    </div>
  );
};
