import React, { useEffect, useMemo, useRef, useState } from 'react';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

const STORAGE_KEY = 'linknest.floatingChatWidget.position.v1';
const SIZE_STORAGE_KEY = 'linknest.floatingChatWidget.size.v1';
const MIN_VISIBLE = 48; // keep at least this many pixels visible on-screen
const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 1000;

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

function safeParsePoint(raw: string | null): Point | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
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

export const FloatingChatWidget: React.FC<{
  children: React.ReactNode;
  defaultPosition?: Point;
}> = ({ children, defaultPosition }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initialPos = useMemo<Point>(() => {
    // default is near bottom-right to avoid overlap with other widgets
    if (defaultPosition) return defaultPosition;
    return { x: 24, y: 100 };
  }, [defaultPosition]);

  const initialSize = useMemo<Size>(() => {
    const stored = safeParseSize(localStorage.getItem(SIZE_STORAGE_KEY));
    if (stored) return stored;
    return { width: 384, height: 600 }; // w-96 = 384px
  }, []);

  const [pos, setPos] = useState<Point>(initialPos);
  const [size, setSize] = useState<Size>(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number; posX: number; posY: number; direction: string } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const latestPosRef = useRef<Point>(initialPos);
  const latestSizeRef = useRef<Size>(initialSize);
  const rafRef = useRef<number | null>(null);
  const pendingPosRef = useRef<Point | null>(null);

  const clampToViewport = (p: Point): Point => {
    const width = size.width;
    const height = size.height;

    const zoom = getCssZoom();
    const { width: vvW, height: vvH } = getVisualViewportSize();
    const layoutViewportWidth = vvW / zoom;
    const layoutViewportHeight = vvH / zoom;

    // Allow moving "all over" while keeping a small portion visible for recovery
    const minX = -width + MIN_VISIBLE;
    const maxX = layoutViewportWidth - MIN_VISIBLE;
    const minY = -height + MIN_VISIBLE;
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

  // Load last position once
  useEffect(() => {
    const stored = safeParsePoint(localStorage.getItem(STORAGE_KEY));
    if (stored) {
      // Defer clamping until after first paint so we can measure size accurately
      requestAnimationFrame(() => setPos(clampToViewport(stored)));
      return;
    }

    // First-time default: bottom-right-ish (zoom-aware) to avoid overlap with other widgets
    requestAnimationFrame(() => {
      const el = containerRef.current;
      const width = el?.offsetWidth ?? 384;
      const height = el?.offsetHeight ?? 600;
      const zoom = getCssZoom();
      const { width: vvW, height: vvH } = getVisualViewportSize();
      const layoutViewportWidth = vvW / zoom;
      const layoutViewportHeight = vvH / zoom;
      setPos(clampToViewport({ x: layoutViewportWidth - width - 24, y: layoutViewportHeight - height - 24 }));
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
    // Ensure no stale listeners remain
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;

    // Delta-based dragging: avoids any "jump" regardless of where the handle is placed
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
      // pointerup/cancel are {once:true}; no need to remove
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

      latestSizeRef.current = { width: newWidth, height: newHeight };
      setSize({ width: newWidth, height: newHeight });
      
      const newPos = clampToViewport({ x: newX, y: newY });
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
        zIndex: 2147483647, // stay above everything
      }}
    >
      <div className="relative w-full h-full">
        {/* Drag handle (bigger + easier to grab, doesn't change layout) */}
        <button
          type="button"
          className={`absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-7 rounded-full shadow-md border border-blue-300/70 dark:border-blue-600/60 bg-brand-500 dark:bg-brand-600 backdrop-blur flex items-center justify-center text-white ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={startDrag}
          title="Drag chat widget (grab here)"
          aria-label="Drag chat widget"
        >
          <span className="text-[14px] leading-none flex items-center gap-0.5">💬 <span className="tracking-widest">⋮</span></span>
        </button>

        {/* Resize handles */}
        <div
          className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize opacity-0 hover:opacity-100 transition-opacity"
          onPointerDown={(e) => startResize(e, 'ne')}
          style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(59, 130, 246, 0.5) 50%)' }}
        />
        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize opacity-0 hover:opacity-100 transition-opacity"
          onPointerDown={(e) => startResize(e, 'se')}
          style={{ background: 'linear-gradient(45deg, transparent 50%, rgba(59, 130, 246, 0.5) 50%)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize opacity-0 hover:opacity-100 transition-opacity"
          onPointerDown={(e) => startResize(e, 'sw')}
          style={{ background: 'linear-gradient(-45deg, transparent 50%, rgba(59, 130, 246, 0.5) 50%)' }}
        />
        <div
          className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize opacity-0 hover:opacity-100 transition-opacity"
          onPointerDown={(e) => startResize(e, 'nw')}
          style={{ background: 'linear-gradient(-135deg, transparent 50%, rgba(59, 130, 246, 0.5) 50%)' }}
        />

        <div className="w-full h-full overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
};
