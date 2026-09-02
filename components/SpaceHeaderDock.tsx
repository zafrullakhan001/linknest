import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const MAGNIFY_RADIUS = 78;
const MAX_SCALE = 1.68;
const LABEL_RADIUS = 52;

export type DockPointer = { x: number; y: number };

type DockItem = {
  id: string;
  title: string;
  getRect: () => DOMRect | null;
};

type DockLabel = {
  title: string;
  x: number;
  y: number;
};

type SpaceHeaderDockContextValue = {
  pointer: DockPointer | null;
  reducedMotion: boolean;
  register: (item: DockItem) => () => void;
  setFocusPointer: (pointer: DockPointer | null) => void;
};

const SpaceHeaderDockContext = createContext<SpaceHeaderDockContextValue | null>(null);

export function useSpaceHeaderDock(): SpaceHeaderDockContextValue | null {
  return useContext(SpaceHeaderDockContext);
}

export function dockScaleFor(
  pointer: DockPointer | null,
  centerX: number,
  centerY: number,
  reducedMotion: boolean
): number {
  if (reducedMotion || !pointer) return 1;
  const distance = Math.hypot(pointer.x - centerX, pointer.y - centerY);
  if (distance >= MAGNIFY_RADIUS) return 1;
  const t = 1 - distance / MAGNIFY_RADIUS;
  const influence = (1 - Math.cos(t * Math.PI)) / 2;
  return 1 + (MAX_SCALE - 1) * influence;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

export const SpaceHeaderDock: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => {
  const reducedMotion = usePrefersReducedMotion();
  const itemsRef = useRef(new Map<string, DockItem>());
  const pointerRef = useRef<DockPointer | null>(null);
  const rafRef = useRef(0);
  const [pointer, setPointer] = useState<DockPointer | null>(null);
  const [focusPointer, setFocusPointer] = useState<DockPointer | null>(null);
  const [label, setLabel] = useState<DockLabel | null>(null);
  const activePointer = pointer ?? focusPointer;

  const register = useCallback((item: DockItem) => {
    itemsRef.current.set(item.id, item);
    return () => {
      itemsRef.current.delete(item.id);
    };
  }, []);

  const updateLabel = useCallback((nextPointer: DockPointer | null) => {
    if (!nextPointer) {
      setLabel(null);
      return;
    }

    let best: { title: string; dist: number; rect: DOMRect } | null = null;
    itemsRef.current.forEach((item) => {
      const rect = item.getRect();
      if (!rect) return;
      const dist = Math.hypot(
        nextPointer.x - (rect.left + rect.width / 2),
        nextPointer.y - (rect.top + rect.height / 2)
      );
      if (!best || dist < best.dist) {
        best = { title: item.title, dist, rect };
      }
    });

    if (!best || best.dist > LABEL_RADIUS) {
      setLabel(null);
      return;
    }

    setLabel({
      title: best.title,
      x: best.rect.left + best.rect.width / 2,
      y: best.rect.top,
    });
  }, []);

  const flushPointer = useCallback(() => {
    rafRef.current = 0;
    const next = pointerRef.current;
    setPointer(next);
    updateLabel(next);
  }, [updateLabel]);

  const onPointerMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      if (rafRef.current) return;
      rafRef.current = window.requestAnimationFrame(flushPointer);
    },
    [flushPointer]
  );

  const clearPointer = useCallback(() => {
    pointerRef.current = null;
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setPointer(null);
    setLabel(null);
  }, []);

  useEffect(() => {
    if (!pointer) updateLabel(activePointer);
  }, [activePointer, pointer, updateLabel]);

  useEffect(() => () => {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
  }, []);

  const value = useMemo<SpaceHeaderDockContextValue>(
    () => ({ pointer: activePointer, reducedMotion, register, setFocusPointer }),
    [activePointer, reducedMotion, register]
  );

  const labelStyle: React.CSSProperties | undefined = label
    ? {
        left: label.x,
        top: Math.max(8, label.y - 10),
      }
    : undefined;

  return (
    <SpaceHeaderDockContext.Provider value={value}>
      <div
        className={className}
        onMouseMove={onPointerMove}
        onMouseLeave={clearPointer}
      >
        {children}
      </div>
      {label &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            key={label.title}
            className="ln-space-dock-label"
            role="tooltip"
            style={labelStyle}
          >
            <span className="ln-space-dock-label-inner">{label.title}</span>
          </div>,
          document.body
        )}
    </SpaceHeaderDockContext.Provider>
  );
};
