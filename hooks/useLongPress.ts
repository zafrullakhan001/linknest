import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

/**
 * Long-press / press-and-hold detection for touch + mouse.
 *
 * Why not just onClick + onContextMenu: iOS Safari fires `contextmenu` only on
 * some elements, and a plain long press otherwise triggers the native
 * text-selection callout. This hook gives a deterministic 500ms hold and
 * cancels itself as soon as the finger moves, so it never fights scrolling.
 *
 * Movement is compared against the pointer's *start* point rather than the last
 * move, so a slow drag still cancels instead of accumulating past the slop.
 */

export interface UseLongPressOptions {
  /** Hold duration in ms before firing. Default 500. */
  delay?: number;
  /** Movement (px) that cancels the press. Default 10. */
  moveTolerance?: number;
  onLongPress: (event: ReactPointerEvent | ReactMouseEvent) => void;
  onClick?: (event: ReactPointerEvent | ReactMouseEvent) => void;
  disabled?: boolean;
}

export interface UseLongPressResult {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerLeave: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  /** True while the hold is in progress (useful for press styling). */
  pressing: boolean;
}

export function useLongPress({
  delay = 500,
  moveTolerance = 10,
  onLongPress,
  onClick,
  disabled = false,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  // Distinguishes "long press already fired" from a real tap, so releasing a
  // long press does not also fire onClick.
  const longPressFiredRef = useRef(false);
  const [pressing, setPressing] = useState(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startRef.current = null;
    setPressing(false);
  }, []);

  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (disabled) return;
    // Ignore secondary buttons; right-click has its own menu.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    longPressFiredRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    setPressing(true);
    timerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      setPressing(false);
      onLongPress(e);
    }, delay);
  }, [delay, disabled, onLongPress]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const start = startRef.current;
    if (!start || timerRef.current === null) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > moveTolerance) clear();
  }, [clear, moveTolerance]);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    const wasLongPress = longPressFiredRef.current;
    const hadTimer = timerRef.current !== null;
    clear();
    if (wasLongPress) {
      longPressFiredRef.current = false;
      return;
    }
    if (hadTimer && onClick) onClick(e);
  }, [clear, onClick]);

  const onPointerLeave = useCallback(() => clear(), [clear]);
  const onPointerCancel = useCallback(() => clear(), [clear]);

  // Suppress the native callout / right-click menu so only our sheet opens.
  const onContextMenu = useCallback((e: ReactMouseEvent) => {
    if (disabled) return;
    e.preventDefault();
  }, [disabled]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
    onContextMenu,
    pressing,
  };
}

export default useLongPress;
