import React, { useEffect, useMemo, useRef, useState } from 'react';

type Point = { x: number; y: number };

const STORAGE_KEY = 'linknest.floatingClock.position.v1';
const MIN_VISIBLE = 48; // keep at least this many pixels visible on-screen

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

export const FloatingClock: React.FC<{
  children: React.ReactNode;
  defaultPosition?: Point; // useful for tests or future settings
}> = ({ children, defaultPosition }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initialPos = useMemo<Point>(() => {
    // default is near bottom-right, but not tied to the footer
    if (defaultPosition) return defaultPosition;
    return { x: 24, y: 24 };
  }, [defaultPosition]);

  const [pos, setPos] = useState<Point>(initialPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const latestPosRef = useRef<Point>(initialPos);
  const rafRef = useRef<number | null>(null);
  const pendingPosRef = useRef<Point | null>(null);

  const clampToViewport = (p: Point): Point => {
    const el = containerRef.current;
    // Use layout size; absolutely-positioned handle should not affect clamping
    const width = el?.offsetWidth ?? 260;
    const height = el?.offsetHeight ?? 120;

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

    // First-time default: bottom-right-ish (zoom-aware)
    requestAnimationFrame(() => {
      const el = containerRef.current;
      const width = el?.offsetWidth ?? 260;
      const height = el?.offsetHeight ?? 120;
      const zoom = getCssZoom();
      const { width: vvW, height: vvH } = getVisualViewportSize();
      const layoutViewportWidth = vvW / zoom;
      const layoutViewportHeight = vvH / zoom;
      setPos(clampToViewport({ x: layoutViewportWidth - width - 12, y: layoutViewportHeight - height - 12 }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep position valid if viewport changes
  useEffect(() => {
    const onResize = () => setPos((p) => clampToViewport(p));
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

  return (
    <div
      ref={containerRef}
      className="linknest-overlay select-none"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 2147483647, // stay above everything
      }}
    >
      <div className="relative">
        {/* Drag handle (bigger + easier to grab, doesn't change clock layout) */}
        <button
          type="button"
          className={`absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-7 rounded-full shadow-md border border-blue-300/70 dark:border-blue-600/60 bg-blue-500/90 dark:bg-blue-600/90 backdrop-blur flex items-center justify-center text-white ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={startDrag}
          title="Drag clock (grab here)"
          aria-label="Drag clock"
        >
          <span className="text-[16px] leading-none tracking-widest flex items-center">⋮⋮⋮</span>
        </button>

        {children}
      </div>
    </div>
  );
};

