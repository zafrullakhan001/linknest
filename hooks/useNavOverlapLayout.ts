import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Measured layout for the desktop nav bar.
 *
 * The nav renders three independently positioned clusters (far-left company logo,
 * centered app brand, right-hand controls). None of them knows how wide the others
 * are, so on narrow desktops the right controls can slide over the centered brand.
 *
 * This hook measures the real pixel widths and reports:
 *  - `brandMaxWidth`   — the largest the centered brand box may become without
 *                        touching either side cluster (the brand truncates instead
 *                        of overlapping).
 *  - `collapseWidgets` — when the full widget pill cannot coexist with a readable
 *                        brand, the caller hides the tail icons behind an overflow
 *                        ("…") menu so the brand stays fully visible.
 *
 * The collapse decision is derived from a *predicted* full pill width (hidden icon
 * count × measured icon width) rather than the currently rendered pill width, so
 * collapsing the pill cannot flip the decision back — no oscillation / render loop.
 */

export interface NavOverlapLayout {
  /** Max width (px) the centered brand box may occupy before it collides with a side cluster. */
  brandMaxWidth: number;
  /**
   * Max width (px) the brand may occupy when it is left-aligned (compact mode),
   * i.e. the space between the nav's left padding and the right-hand cluster.
   */
  compactBrandMaxWidth: number;
  /** True when the widget pill must move its tail icons into an overflow menu. */
  collapseWidgets: boolean;
}

export interface UseNavOverlapLayoutOptions {
  /** Skip all measurement (e.g. mobile, where the desktop bar is not rendered). */
  enabled?: boolean;
  /** Padded inner container of the nav — the positioning context of every cluster. */
  navRef: RefObject<HTMLElement | null>;
  /** Right-hand controls cluster (auth pill + widget pill + profile avatar). */
  rightClusterRef: RefObject<HTMLElement | null>;
  /** Far-left company logo, when one is rendered. */
  companyLogoRef?: RefObject<HTMLElement | null>;
  /** One widget icon button whose width represents every icon in the pill. */
  iconProbeRef?: RefObject<HTMLElement | null>;
  /** Smallest brand box worth keeping centered (logo + a readable slice of the name). */
  brandMinWidth: number;
  /** Total icons the pill renders when fully expanded. */
  widgetCount: number;
  /** Icons kept visible while the pill is collapsed (the remainder go to the overflow menu). */
  headCount: number;
  /** Gap between pill icons, in px (matches Tailwind `gap-0.5`). */
  pillGap?: number;
  /** Re-measure when this changes (app name / allowed icons / admin state / …). */
  signature?: string;
}

/** Horizontal padding of the nav's inner container (matches Tailwind `px-4`). */
const NAV_PAD = 16;
/** Minimum breathing room kept between the brand and each side cluster. */
const GAP = 12;

function readWidth(el: HTMLElement | null): number {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  return Number.isFinite(rect.width) && rect.width > 0 ? rect.width : 0;
}


export function useNavOverlapLayout({
  enabled = true,
  navRef,
  rightClusterRef,
  companyLogoRef,
  iconProbeRef,
  brandMinWidth,
  widgetCount,
  headCount,
  pillGap = 2,
  signature = '',
}: UseNavOverlapLayoutOptions): NavOverlapLayout {
  const [layout, setLayout] = useState<NavOverlapLayout>(() => ({
    brandMaxWidth: Math.max(0, Math.round(brandMinWidth)),
    compactBrandMaxWidth: Math.max(0, Math.round(brandMinWidth)),
    collapseWidgets: false,
  }));

  // Latest decision, readable from the ResizeObserver callback without re-binding it.
  const collapseRef = useRef(layout.collapseWidgets);
  collapseRef.current = layout.collapseWidgets;

  const safeBrandMin = Math.max(0, brandMinWidth);
  const safeWidgetCount = Math.max(0, widgetCount);
  const safeHeadCount = Math.max(0, Math.min(headCount, safeWidgetCount));

  const measure = useCallback(() => {
    if (!enabled) return;
    const navEl = navRef.current;
    if (!navEl) return;

    const navWidth = navEl.clientWidth || navEl.getBoundingClientRect().width;
    if (navWidth <= 0) return;

    const rightWidth = readWidth(rightClusterRef.current);
    const companyWidth = readWidth(companyLogoRef?.current ?? null);

    // Predicted width the right cluster gains when a collapsed pill expands.
    // Uses the measured single-icon width so it does not depend on the current render.
    const iconWidth = readWidth(iconProbeRef?.current ?? null);
    const hiddenIcons = safeWidgetCount - safeHeadCount - 1;
    const canCollapse = iconWidth > 0 && hiddenIcons > 0;
    const expandDelta = canCollapse ? Math.round(hiddenIcons * (iconWidth + pillGap)) : 0;

    const collapsed = collapseRef.current;

    // `rightWidth` is whatever the pill currently renders (full, or collapsed with
    // an overflow button). Reconstruct the always-expanded width so the collapse
    // decision does not depend on the current render (which would oscillate):
    //  - expanded  → rightWidth already is the expanded width
    //  - collapsed → add back the icons stashed behind the overflow menu, minus
    //                the overflow button that the expanded pill does not show
    const expandedRightWidth = rightWidth + (collapsed ? expandDelta : 0);

    // The brand is centered, so each side only gets half of the nav minus its own
    // padding. Two rooms matter:
    //  - `halfWithCurrent`  → room as the pill is rendered *now*; clamps the brand.
    //  - `halfWithExpanded` → worst case with every widget inline; decides collapse.
    const halfWithCurrent =
      Math.min(
        navWidth / 2 - NAV_PAD - companyWidth,
        navWidth / 2 - NAV_PAD - rightWidth
      ) - GAP;
    const halfWithExpanded =
      Math.min(
        navWidth / 2 - NAV_PAD - companyWidth,
        navWidth / 2 - NAV_PAD - expandedRightWidth
      ) - GAP;

    // Collapse only when the tail icons would otherwise reach the brand.
    const nextCollapse = expandDelta > 0 && halfWithExpanded < safeBrandMin;
    const nextBrandMaxWidth = Math.max(0, Math.round(halfWithCurrent * 2));
    // Compact/left-aligned mode: brand starts at the nav's left padding, so it may
    // use everything up to the left edge of the right-hand cluster.
    const nextCompactBrandMaxWidth = Math.max(
      0,
      Math.round(navWidth - 2 * NAV_PAD - expandedRightWidth)
    );

    setLayout((prev) =>
      prev.collapseWidgets === nextCollapse &&
      prev.brandMaxWidth === nextBrandMaxWidth &&
      prev.compactBrandMaxWidth === nextCompactBrandMaxWidth
        ? prev
        : {
            collapseWidgets: nextCollapse,
            brandMaxWidth: nextBrandMaxWidth,
            compactBrandMaxWidth: nextCompactBrandMaxWidth,
          }
    );

  }, [
    enabled,
    navRef,
    rightClusterRef,
    companyLogoRef,
    iconProbeRef,
    safeBrandMin,
    safeWidgetCount,
    safeHeadCount,
    pillGap,
  ]);

  useLayoutEffect(() => {
    if (!enabled) return;
    measure();

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    const navEl = navRef.current;
    const rightEl = rightClusterRef.current;
    const iconEl = iconProbeRef?.current ?? null;
    if (observer) {
      if (navEl) observer.observe(navEl);
      if (rightEl) observer.observe(rightEl);
      if (iconEl) observer.observe(iconEl);
    }
    window.addEventListener('resize', measure);

    let cancelled = false;
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready
      ?.then(() => {
        if (!cancelled) measure();
      })
      .catch(() => {
        /* webfont metrics unavailable — the initial measurement stands */
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, enabled, signature]);

  return layout;
}
