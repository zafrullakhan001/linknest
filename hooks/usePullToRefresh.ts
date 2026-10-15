import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Pull-to-refresh for touch devices.
 *
 * Only engages when the document is already scrolled to the top, so it never
 * hijacks an in-progress scroll. `overscroll-behavior-y: contain` is set in
 * index.css for the same reason - without it mobile Safari rubber-bands the
 * document and the gesture fights the browser.
 */

export interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  /** Drag distance (px) that triggers a refresh. Default 70. */
  threshold?: number;
  /** Maximum visual pull distance (px). Default 110. */
  maxPull?: number;
  /** Disable the gesture (e.g. while a modal is open). */
  disabled?: boolean;
  /** Element to attach to. Defaults to window/document. */
  targetRef?: RefObject<HTMLElement | null>;
}

export interface UsePullToRefreshResult {
  /** Current pull distance in px (0 when idle). */
  pull: number;
  /** True once `pull` passes the threshold and release would refresh. */
  armed: boolean;
  /** True while onRefresh is running. */
  refreshing: boolean;
}

function atScrollTop(targetRef?: RefObject<HTMLElement | null>): boolean {
  if (targetRef?.current) return targetRef.current.scrollTop <= 0;
  const scroller = document.scrollingElement || document.documentElement;
  return (window.scrollY ?? scroller.scrollTop ?? 0) <= 0;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  maxPull = 110,
  disabled = false,
  targetRef,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  // Mirror of `pull` for the touchend handler, which closes over stale state
  // otherwise (the effect only re-binds when threshold/disabled change).
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const setPullBoth = useCallback((value: number) => {
    pullRef.current = value;
    setPull(value);
  }, []);

  useEffect(() => {
    if (disabled) {
      startYRef.current = null;
      activeRef.current = false;
      setPullBoth(0);
      return;
    }

    const el: HTMLElement | Window = targetRef?.current ?? window;

    const onTouchStart = (event: Event) => {
      const e = event as TouchEvent;
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      if (!atScrollTop(targetRef)) return;
      startYRef.current = e.touches[0].clientY;
      activeRef.current = false;
    };

    const onTouchMove = (event: Event) => {
      const e = event as TouchEvent;
      if (startYRef.current === null || refreshingRef.current) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        // Scrolling up - hand control back to the browser.
        if (pullRef.current !== 0) setPullBoth(0);
        activeRef.current = false;
        return;
      }
      if (!atScrollTop(targetRef)) {
        startYRef.current = null;
        setPullBoth(0);
        return;
      }
      activeRef.current = true;
      // Rubber-band: the further you pull, the slower it grows.
      const damped = Math.min(maxPull, delta * 0.5);
      setPullBoth(damped);
    };

    const finish = () => {
      const shouldRefresh = activeRef.current && pullRef.current >= threshold;
      startYRef.current = null;
      activeRef.current = false;
      if (!shouldRefresh) {
        setPullBoth(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setPullBoth(threshold);
      void Promise.resolve(onRefresh())
        .catch(() => { /* caller logs */ })
        .finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullBoth(0);
        });
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', finish as EventListener, { passive: true });
    el.addEventListener('touchcancel', finish as EventListener, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', finish as EventListener);
      el.removeEventListener('touchcancel', finish as EventListener);
    };
  }, [disabled, maxPull, onRefresh, setPullBoth, targetRef, threshold]);

  return { pull, armed: pull >= threshold, refreshing };
}

export default usePullToRefresh;
