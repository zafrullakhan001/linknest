import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const MAGNIFY_RADIUS = 78;
const MAX_SCALE = 1.48;

export type DockPointer = { x: number; y: number };

type SpaceHeaderDockContextValue = {
  pointer: DockPointer | null;
  reducedMotion: boolean;
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
  const pointerRef = useRef<DockPointer | null>(null);
  const rafRef = useRef(0);
  const [pointer, setPointer] = useState<DockPointer | null>(null);
  const [focusPointer, setFocusPointer] = useState<DockPointer | null>(null);
  const activePointer = pointer ?? focusPointer;

  const flushPointer = useCallback(() => {
    rafRef.current = 0;
    setPointer(pointerRef.current);
  }, []);

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
  }, []);

  useEffect(() => () => {
    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
  }, []);

  const value = useMemo<SpaceHeaderDockContextValue>(
    () => ({ pointer: activePointer, reducedMotion, setFocusPointer }),
    [activePointer, reducedMotion]
  );

  return (
    <SpaceHeaderDockContext.Provider value={value}>
      <div
        className={className}
        onMouseMove={onPointerMove}
        onMouseLeave={clearPointer}
      >
        {children}
      </div>
    </SpaceHeaderDockContext.Provider>
  );
};
