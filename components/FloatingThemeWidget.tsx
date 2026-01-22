import React, { useEffect, useMemo, useRef, useState } from 'react';

type Point = { x: number; y: number };

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

function getCenteredPosition(containerWidth: number = 420, containerHeight: number = 600): Point {
  const zoom = getCssZoom();
  const { width: vvW, height: vvH } = getVisualViewportSize();
  const layoutViewportWidth = vvW / zoom;
  const layoutViewportHeight = vvH / zoom;

  return {
    x: (layoutViewportWidth - containerWidth) / 2,
    y: (layoutViewportHeight - containerHeight) / 2,
  };
}

export const FloatingThemeWidget: React.FC<{
  children: React.ReactNode;
  defaultPosition?: Point;
  onClose?: () => void;
}> = ({ children, defaultPosition, onClose }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initialPos = useMemo<Point>(() => {
    // Always center on screen
    if (defaultPosition) return defaultPosition;
    return getCenteredPosition();
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
    const width = el?.offsetWidth ?? 420;
    const height = el?.offsetHeight ?? 600;

    const zoom = getCssZoom();
    const { width: vvW, height: vvH } = getVisualViewportSize();
    const layoutViewportWidth = vvW / zoom;
    const layoutViewportHeight = vvH / zoom;

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

  // Center widget on mount
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = containerRef.current;
      const width = el?.offsetWidth ?? 420;
      const height = el?.offsetHeight ?? 600;
      setPos(clampToViewport(getCenteredPosition(width, height)));
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

  // Cleanup listeners on unmount
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
        {/* Drag handle */}
        <button
          type="button"
          className={`absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-7 rounded-full shadow-md border border-purple-300/70 dark:border-purple-600/60 bg-purple-500/90 dark:bg-purple-600/90 backdrop-blur flex items-center justify-center text-white z-50 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          style={{ zIndex: 50 }}
          onPointerDown={startDrag}
          title="Drag theme widget"
          aria-label="Drag theme widget"
        >
          <span className="text-[16px] leading-none tracking-widest flex items-center">⋮⋮⋮</span>
        </button>

        <div className="pt-4">
          {children}
        </div>
      </div>
    </div>
  );
};
