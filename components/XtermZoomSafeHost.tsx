import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

function readPageZoom(): number {
  try {
    const raw = getComputedStyle(document.documentElement).zoom;
    const z = raw && raw !== 'normal' ? Number.parseFloat(String(raw)) : 1;
    if (Number.isFinite(z) && z > 0) return z;
  } catch {
    // ignore
  }
  try {
    const stored = localStorage.getItem('linknest_user_page_zoom');
    if (stored) {
      const pct = Number.parseFloat(stored);
      if (Number.isFinite(pct) && pct > 0) return pct / 100;
    }
  } catch {
    // ignore
  }
  return 1;
}

export interface XtermZoomSafeHostProps {
  className?: string;
  /** Called after zoom compensation changes so FitAddon can refit. */
  onZoomCompensated?: () => void;
  style?: React.CSSProperties;
}

/**
 * Host element for xterm.open(). Counteracts app-wide CSS `html { zoom }` so
 * mouse selection / hit-testing line up with glyphs.
 */
export const XtermZoomSafeHost = forwardRef<HTMLDivElement, XtermZoomSafeHostProps>(
  function XtermZoomSafeHost({ className = '', onZoomCompensated, style }, ref) {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const lastZoomRef = useRef(1);

    useImperativeHandle(ref, () => innerRef.current as HTMLDivElement, []);

    useEffect(() => {
      let raf = 0;
      const sync = () => {
        const inner = innerRef.current;
        if (!inner) return;
        const zoom = readPageZoom();
        lastZoomRef.current = zoom;
        if (Math.abs(zoom - 1) < 0.001) {
          inner.style.zoom = '';
          inner.style.width = '100%';
          inner.style.height = '100%';
        } else {
          // Neutralize page zoom for xterm math; enlarge box so it still fills the outer.
          inner.style.zoom = String(1 / zoom);
          inner.style.width = `${zoom * 100}%`;
          inner.style.height = `${zoom * 100}%`;
        }
        window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(() => onZoomCompensated?.());
      };

      sync();

      // Observe zoom changes on <html> and injected style tags
      const obs = new MutationObserver(sync);
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
      const headObs = new MutationObserver(sync);
      headObs.observe(document.head, { childList: true, subtree: true, characterData: true });

      const onStylesApplied = () => sync();
      window.addEventListener('linknest-styles-applied', onStylesApplied);
      window.addEventListener('resize', sync);
      return () => {
        window.cancelAnimationFrame(raf);
        obs.disconnect();
        headObs.disconnect();
        window.removeEventListener('linknest-styles-applied', onStylesApplied);
        window.removeEventListener('resize', sync);
      };
    }, [onZoomCompensated]);

    return (
      <div
        ref={outerRef}
        className={`relative min-h-0 min-w-0 overflow-hidden ${className}`}
        style={style}
      >
        <div
          ref={innerRef}
          className="absolute top-0 left-0 overflow-hidden [&_.xterm]:h-full [&_.xterm]:w-full [&_.xterm-viewport]:overflow-auto"
        />
      </div>
    );
  }
);
