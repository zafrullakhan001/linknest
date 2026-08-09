import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

/** Read LinkNest page zoom as a scale factor (1 = 100%). Prefer live CSS over storage. */
export function readPageZoom(): number {
  try {
    const raw = getComputedStyle(document.documentElement).zoom;
    if (raw && raw !== 'normal') {
      let z = Number.parseFloat(String(raw));
      if (Number.isFinite(z) && z >= 5 && z <= 500) z = z / 100;
      if (Number.isFinite(z) && z > 0.25 && z < 4) return z;
    }
  } catch {
    // ignore
  }
  try {
    const stored = localStorage.getItem('linknest_user_page_zoom');
    if (stored) {
      const pct = Number.parseFloat(stored);
      if (Number.isFinite(pct) && pct >= 25 && pct <= 400) return pct / 100;
    }
  } catch {
    // ignore
  }
  return 1;
}

export interface XtermZoomSafeHostProps {
  className?: string;
  /** Called after size/zoom sync so FitAddon can refit. */
  onZoomCompensated?: () => void;
  style?: React.CSSProperties;
}

/**
 * Full-bleed xterm host that counters `html { zoom }` for accurate selection
 * without leaving a black strip.
 *
 * Uses pixel sizes (not %) from the outer box:
 *   child.zoom = 1/pageZoom
 *   child.width = outer.clientWidth * pageZoom
 * so after zoom, painted size === outer size.
 */
export const XtermZoomSafeHost = forwardRef<HTMLDivElement, XtermZoomSafeHostProps>(
  function XtermZoomSafeHost({ className = '', onZoomCompensated, style }, ref) {
    const outerRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => innerRef.current as HTMLDivElement, []);

    useEffect(() => {
      let raf = 0;
      let lastKey = '';

      const sync = () => {
        const outer = outerRef.current;
        const inner = innerRef.current;
        if (!outer || !inner) return;

        const pageZoom = readPageZoom();
        const ow = Math.max(0, outer.clientWidth);
        const oh = Math.max(0, outer.clientHeight);
        const key = `${pageZoom.toFixed(4)}:${ow}x${oh}`;

        inner.style.position = 'absolute';
        inner.style.left = '0';
        inner.style.top = '0';
        inner.style.right = 'auto';
        inner.style.bottom = 'auto';
        inner.style.boxSizing = 'border-box';
        inner.style.margin = '0';
        inner.style.padding = '0';
        inner.style.overflow = 'hidden';

        if (ow < 2 || oh < 2) {
          return;
        }

        if (Math.abs(pageZoom - 1) < 0.005) {
          // No compensation — fill the pane exactly
          inner.style.zoom = '';
          inner.style.width = '100%';
          inner.style.height = '100%';
          inner.style.right = '0';
          inner.style.bottom = '0';
        } else {
          // Painted size = cssSize * (1/pageZoom). Want painted === outer.
          // cssSize = outer * pageZoom (integer px avoids subpixel black gaps).
          inner.style.zoom = String(1 / pageZoom);
          inner.style.width = `${Math.round(ow * pageZoom)}px`;
          inner.style.height = `${Math.round(oh * pageZoom)}px`;
        }

        if (key === lastKey) return;
        lastKey = key;
        window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => onZoomCompensated?.());
        });
      };

      sync();

      const ro =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => sync()) : null;
      if (outerRef.current) ro?.observe(outerRef.current);

      const obs = new MutationObserver(() => {
        lastKey = '';
        sync();
      });
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
      const headObs = new MutationObserver(() => {
        lastKey = '';
        sync();
      });
      headObs.observe(document.head, { childList: true, subtree: true, characterData: true });

      const onStylesApplied = () => {
        lastKey = '';
        sync();
      };
      window.addEventListener('linknest-styles-applied', onStylesApplied);
      window.addEventListener('resize', onStylesApplied);

      return () => {
        window.cancelAnimationFrame(raf);
        ro?.disconnect();
        obs.disconnect();
        headObs.disconnect();
        window.removeEventListener('linknest-styles-applied', onStylesApplied);
        window.removeEventListener('resize', onStylesApplied);
      };
    }, [onZoomCompensated]);

    return (
      <div
        ref={outerRef}
        className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden ${className}`}
        style={style}
      >
        <div
          ref={innerRef}
          className="[&_.xterm]:h-full [&_.xterm]:w-full [&_.xterm-viewport]:h-full [&_.xterm-viewport]:w-full [&_.xterm-viewport]:overflow-auto"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>
    );
  }
);
