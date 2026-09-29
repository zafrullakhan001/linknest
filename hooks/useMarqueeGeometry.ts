import { useEffect, useState } from 'react';
import { marqueePaceScale, resolveMarqueeSeamGap } from '../utils/messageStyle';

/**
 * Measuring contract shared with the marquee components (see `components/TileGrid.tsx` and
 * `components/TileMessageBanner.tsx`): the `overflow-hidden` strip is passed in through the ref,
 * each message run carries `data-marquee-run`, every message row `data-marquee-message` and the
 * seam spacer `data-marquee-seam`.
 */
const RUN_SELECTOR = '[data-marquee-run]';
const MESSAGE_SELECTOR = '[data-marquee-message]';
const SEAM_SELECTOR = '[data-marquee-seam]';

export interface MarqueeGeometry {
  /** Attach to the `overflow-hidden` element that clips the marquee. */
  viewportRef: (node: HTMLDivElement | null) => void;
  /** Seam gap in px between the run and its clone (0 until measured). */
  gap: number;
  /** Loop-duration multiplier that keeps the pixels-per-second of the stored value. */
  paceScale: number;
  /**
   * True once the strip has been measured. The track stays invisible until then, so the un-measured
   * zero-gap frame can never flash two copies of the same message.
   */
  measured: boolean;
  /** Strip width in px (0 until measured): the distance the first copy enters from. */
  viewportWidth: number;
  /** One full pitch in px = run content + seam gap (0 until measured). */
  pitchWidth: number;
}

/**
 * Measures a marquee strip to work out how far apart the two message runs have to be.
 *
 * A zero-gap loop shows the same message twice whenever the run is narrower than the strip, so the
 * gap is derived from the real geometry (`resolveMarqueeSeamGap`): the next copy then starts
 * entering the right edge exactly as the previous copy leaves the left edge - one message after
 * another, never a duplicate and never an empty strip. Re-measures on strip/content resizes and
 * after fonts load, so cards, side-by-side layouts and mobile widths all stay correct.
 */
export const useMarqueeGeometry = (): MarqueeGeometry => {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [gap, setGap] = useState(0);
  const [paceScale, setPaceScale] = useState(1);
  const [measured, setMeasured] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [pitchWidth, setPitchWidth] = useState(0);

  useEffect(() => {
    if (!viewport) return;

    const measure = () => {
      const run = viewport.querySelector<HTMLElement>(RUN_SELECTOR);
      if (!run) return;

      const messageWidths: number[] = [];
      run.querySelectorAll<HTMLElement>(MESSAGE_SELECTOR).forEach((node) => {
        messageWidths.push(node.getBoundingClientRect().width);
      });
      if (messageWidths.length === 0) return;

      const seamWidth = run.querySelector<HTMLElement>(SEAM_SELECTOR)?.getBoundingClientRect().width ?? 0;
      // Run width without the spacer = the content the user actually reads.
      const runContentWidth = run.getBoundingClientRect().width - seamWidth;
      if (runContentWidth <= 0) return;

      const nextGap = resolveMarqueeSeamGap(viewport.clientWidth, Math.max(...messageWidths), runContentWidth);
      const nextPaceScale = marqueePaceScale(runContentWidth, nextGap);
      const nextViewportWidth = viewport.clientWidth;
      const nextPitchWidth = runContentWidth + nextGap;

      setGap((previous) => (Math.abs(previous - nextGap) <= 1 ? previous : nextGap));
      setPaceScale((previous) => (Math.abs(previous - nextPaceScale) <= 0.01 ? previous : nextPaceScale));
      setViewportWidth((previous) => (Math.abs(previous - nextViewportWidth) <= 1 ? previous : nextViewportWidth));
      setPitchWidth((previous) => (Math.abs(previous - nextPitchWidth) <= 1 ? previous : nextPitchWidth));
      setMeasured(true);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    const run = viewport.querySelector<HTMLElement>(RUN_SELECTOR);
    if (run) observer.observe(run);

    // A late font swap changes every message width, which does not resize the run container.
    let cancelled = false;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { if (!cancelled) measure(); }).catch(() => { });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [viewport]);

  return { viewportRef: setViewport, gap, paceScale, measured, viewportWidth, pitchWidth };
};
