import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { prepareViewerHtml } from '../utils/richTextDisplay';
import { linkHoverTitle, linkHoverTooltipHtml } from '../utils/linkFeatureToggles';
import { normalizeLinkTooltipStyle } from '../utils/linkTooltipPreference';

type LinkLike = { notesEnabled?: boolean; notes?: string; tooltip?: string; tooltipStyle?: string };

interface LinkHoverTooltipProps {
  link: LinkLike;
  fallbackTitle?: string;
  children: React.ReactElement;
}

const VIEW_PAD = 8;
const SIDE_GAP = 10;

export const LINK_TOOLTIP_ANCHOR_ATTR = 'data-ln-tooltip-anchor';

function findTooltipAnchor(root: HTMLElement): HTMLElement {
  const candidates = [
    root.querySelector<HTMLElement>(`[${LINK_TOOLTIP_ANCHOR_ATTR}]`),
    root.querySelector<HTMLElement>('.linknest-content-link-title'),
    root.querySelector<HTMLElement>('.linknest-content-link-domain'),
  ];
  for (const el of candidates) {
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 1 && rect.height > 1) return el;
  }
  return root;
}

function placeBesideAnchor(anchor: DOMRect, tipWidth: number, tipHeight: number): { left: number; top: number } {
  const spaceRight = window.innerWidth - anchor.right - VIEW_PAD;
  const spaceLeft = anchor.left - VIEW_PAD;
  const needs = tipWidth + SIDE_GAP;
  const preferRight = spaceRight >= needs || spaceRight >= spaceLeft;

  let left = preferRight
    ? anchor.right + SIDE_GAP
    : anchor.left - tipWidth - SIDE_GAP;

  let top = anchor.top;
  if (top + tipHeight > window.innerHeight - VIEW_PAD) {
    top = window.innerHeight - VIEW_PAD - tipHeight;
  }
  if (top < VIEW_PAD) top = VIEW_PAD;

  const maxLeft = Math.max(VIEW_PAD, window.innerWidth - tipWidth - VIEW_PAD);
  left = Math.min(Math.max(left, VIEW_PAD), maxLeft);
  return { left, top };
}

/**
 * Rich mode: custom HTML tooltip beside the URL.
 * Yellow/classic mode: native browser/Windows `title` tooltip (no custom overlay).
 */
export const LinkHoverTooltip: React.FC<LinkHoverTooltipProps> = ({
  link,
  fallbackTitle,
  children,
}) => {
  const isRich = normalizeLinkTooltipStyle(link.tooltipStyle) === 'rich';
  const sourceHtml = isRich ? linkHoverTooltipHtml(link) : '';
  const nativeTitle = linkHoverTitle(link, fallbackTitle || '');
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });
  const delayRef = useRef<number | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const anchorElRef = useRef<HTMLElement | null>(null);

  const clearDelay = () => {
    if (delayRef.current != null) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
  };

  const placeFromAnchor = useCallback(() => {
    const anchorEl = anchorElRef.current;
    if (!anchorEl) return;
    const anchor = anchorEl.getBoundingClientRect();
    const tip = tipRef.current;
    const tipWidth = tip?.offsetWidth || 240;
    const tipHeight = tip?.offsetHeight || 48;
    setCoords(placeBesideAnchor(anchor, tipWidth, tipHeight));
  }, []);

  const hide = useCallback(() => {
    clearDelay();
    setOpen(false);
    anchorElRef.current = null;
  }, []);

  useEffect(() => {
    if (!isRich) hide();
  }, [isRich, hide]);

  const scheduleShow = useCallback((root: HTMLElement) => {
    if (!isRich || !sourceHtml) return;
    anchorElRef.current = findTooltipAnchor(root);
    placeFromAnchor();
    if (open) return;
    clearDelay();
    delayRef.current = window.setTimeout(() => setOpen(true), 120);
  }, [isRich, sourceHtml, open, placeFromAnchor]);

  useEffect(() => () => clearDelay(), []);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => hide();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  useEffect(() => {
    if (!open || !isRich) return;
    const id = window.requestAnimationFrame(() => placeFromAnchor());
    return () => window.cancelAnimationFrame(id);
  }, [open, isRich, sourceHtml, placeFromAnchor]);

  const child = React.Children.only(children) as React.ReactElement<Record<string, unknown>>;
  const childProps = child.props;

  if (!isRich) {
    return React.cloneElement(child, {
      title: nativeTitle || childProps.title || fallbackTitle,
    });
  }

  const composed = React.cloneElement(child, {
    title: sourceHtml ? undefined : (childProps.title ?? fallbackTitle),
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      (childProps.onMouseEnter as ((ev: React.MouseEvent<HTMLElement>) => void) | undefined)?.(e);
      scheduleShow(e.currentTarget);
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      (childProps.onMouseLeave as ((ev: React.MouseEvent<HTMLElement>) => void) | undefined)?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      (childProps.onFocus as ((ev: React.FocusEvent<HTMLElement>) => void) | undefined)?.(e);
      scheduleShow(e.currentTarget);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      (childProps.onBlur as ((ev: React.FocusEvent<HTMLElement>) => void) | undefined)?.(e);
      hide();
    },
  });

  return (
    <>
      {composed}
      {open && sourceHtml && typeof document !== 'undefined' && createPortal(
        <div
          ref={tipRef}
          role="tooltip"
          className="ln-hover-tooltip"
          style={{ left: coords.left, top: coords.top }}
        >
          <div
            className="ln-tinymce-content ln-hover-tooltip-body"
            dangerouslySetInnerHTML={{ __html: prepareViewerHtml(sourceHtml) }}
          />
        </div>,
        document.body
      )}
    </>
  );
};
