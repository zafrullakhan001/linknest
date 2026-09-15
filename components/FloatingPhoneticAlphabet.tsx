import React, { useEffect, useMemo, useRef, useState } from 'react';

type Point = { x: number; y: number };
type Size = { width: number; height: number };

const STORAGE_KEY_POS = 'linknest.floatingPhoneticAlphabet.position.v1';
const STORAGE_KEY_SIZE = 'linknest.floatingPhoneticAlphabet.size.v1';
const MIN_VISIBLE = 48; // keep at least this many pixels visible on-screen
const MIN_WIDTH = 320;
const MIN_HEIGHT = 300;
const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 500;

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
      Number.isFinite(parsed.height) &&
      parsed.width >= MIN_WIDTH &&
      parsed.height >= MIN_HEIGHT
    ) {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    // ignore
  }
  return null;
}

export const FloatingPhoneticAlphabet: React.FC<{
  children: React.ReactNode;
  defaultPosition?: Point; // useful for tests or future settings
}> = ({ children, defaultPosition }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initialPos = useMemo<Point>(() => {
    // default is near top-left to avoid overlap with clock
    if (defaultPosition) return defaultPosition;
    return { x: 24, y: 100 };
  }, [defaultPosition]);

  const [pos, setPos] = useState<Point>(initialPos);
  const [size, setSize] = useState<Size>(() => {
    const stored = safeParseSize(localStorage.getItem(STORAGE_KEY_SIZE));
    return stored || { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const latestPosRef = useRef<Point>(initialPos);
  const latestSizeRef = useRef<Size>(size);
  const rafRef = useRef<number | null>(null);
  const pendingPosRef = useRef<Point | null>(null);
  const pendingSizeRef = useRef<Size | null>(null);

  const clampToViewport = (p: Point): Point => {
    const zoom = getCssZoom();
    const { width: vvW, height: vvH } = getVisualViewportSize();
    const layoutViewportWidth = vvW / zoom;
    const layoutViewportHeight = vvH / zoom;

    // Allow moving "all over" while keeping a small portion visible for recovery
    const minX = -latestSizeRef.current.width + MIN_VISIBLE;
    const maxX = layoutViewportWidth - MIN_VISIBLE;
    const minY = -latestSizeRef.current.height + MIN_VISIBLE;
    const maxY = layoutViewportHeight - MIN_VISIBLE;

    return {
      x: clamp(p.x, minX, maxX),
      y: clamp(p.y, minY, maxY),
    };
  };

  const clampSize = (s: Size): Size => {
    const zoom = getCssZoom();
    const { width: vvW, height: vvH } = getVisualViewportSize();
    const layoutViewportWidth = vvW / zoom;
    const layoutViewportHeight = vvH / zoom;

    return {
      width: clamp(s.width, MIN_WIDTH, layoutViewportWidth - pos.x),
      height: clamp(s.height, MIN_HEIGHT, layoutViewportHeight - pos.y),
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

  const setSizeBatched = (next: Size) => {
    pendingSizeRef.current = next;
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const s = pendingSizeRef.current;
      if (!s) return;
      pendingSizeRef.current = null;
      latestSizeRef.current = s;
      setSize(s);
    });
  };

  // Load last position and size once
  useEffect(() => {
    const storedPos = safeParsePoint(localStorage.getItem(STORAGE_KEY_POS));
    const storedSize = safeParseSize(localStorage.getItem(STORAGE_KEY_SIZE));
    
    if (storedSize) {
      latestSizeRef.current = storedSize;
      setSize(storedSize);
    }

    if (storedPos) {
      // Defer clamping until after first paint so we can measure size accurately
      requestAnimationFrame(() => setPos(clampToViewport(storedPos)));
      return;
    }

    // First-time default: top-left-ish (zoom-aware) to avoid overlap with clock
    requestAnimationFrame(() => {
      setPos(clampToViewport({ x: 12, y: 100 }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep position and size valid if viewport changes
  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampToViewport(p));
      setSize((s) => clampSize(s));
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
        localStorage.setItem(STORAGE_KEY_POS, JSON.stringify(latestPosRef.current));
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

  const startResize = (e: React.PointerEvent) => {
    // Ensure no stale listeners remain
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;

    // Delta-based resizing
    resizeStartRef.current = { x: e.clientX, y: e.clientY, width: latestSizeRef.current.width, height: latestSizeRef.current.height };
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      const zoom = getCssZoom();
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      const next = clampSize({ 
        width: start.width + dx / zoom, 
        height: start.height + dy / zoom 
      });
      setSizeBatched(next);
    };

    const onUp = () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      resizeStartRef.current = null;
      setIsResizing(false);
      try {
        localStorage.setItem(STORAGE_KEY_SIZE, JSON.stringify(latestSizeRef.current));
        // Re-clamp position after resize
        setPos((p) => clampToViewport(p));
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
      <div className="relative h-full flex flex-col">
        {/* Drag handle (bigger + easier to grab, doesn't change layout) */}
        <button
          type="button"
          className={`absolute -top-3 left-1/2 -translate-x-1/2 w-16 h-7 rounded-full shadow-md border border-blue-300/70 dark:border-blue-600/60 bg-blue-500/90 dark:bg-blue-600/90 backdrop-blur flex items-center justify-center text-white ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={startDrag}
          title="Drag phonetic alphabet (grab here)"
          aria-label="Drag phonetic alphabet"
        >
          <span className="text-[16px] leading-none tracking-widest flex items-center">⋮⋮⋮</span>
        </button>

        {/* Resize handle (bottom-right corner) */}
        <button
          type="button"
          className={`absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize ${
            isResizing ? 'cursor-nwse-resizing' : ''
          }`}
          onPointerDown={startResize}
          title="Resize widget"
          aria-label="Resize widget"
          style={{
            background: 'linear-gradient(135deg, transparent 0%, transparent 40%, rgba(59, 130, 246, 0.5) 40%, rgba(59, 130, 246, 0.5) 60%, transparent 60%)',
          }}
        >
          <div className="absolute bottom-0 right-0 w-3 h-3 border-r-2 border-b-2 border-blue-400 dark:border-blue-500"></div>
        </button>

        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
};
