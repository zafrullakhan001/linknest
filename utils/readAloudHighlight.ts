/** Current-word highlight via DOM overlays (works with custom fonts). */
export const READ_ALOUD_HIGHLIGHT_NAME = 'ln-read-aloud';
export const READ_ALOUD_TRAIL_NAME = 'ln-read-aloud-trail';
export const READ_ALOUD_CURRENT_NAME = 'ln-read-aloud-current';

const OVERLAY_LAYER_ATTR = 'data-ln-read-aloud-overlay';

export type DomCharMap = {
  text: string;
  /** DOM location for each character in `text` (same length as text). */
  positions: Array<{ node: Text; offset: number }>;
};

export function supportsCssHighlight(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

function clearCssHighlights(): void {
  if (typeof window === 'undefined' || !supportsCssHighlight()) return;
  try {
    CSS.highlights.delete(READ_ALOUD_HIGHLIGHT_NAME);
    CSS.highlights.delete(READ_ALOUD_TRAIL_NAME);
    CSS.highlights.delete(READ_ALOUD_CURRENT_NAME);
  } catch {
    // Ignore
  }
}

function ensureOverlayLayer(container: HTMLElement): HTMLElement {
  let layer = container.querySelector<HTMLElement>(`:scope > [${OVERLAY_LAYER_ATTR}]`);
  if (!layer) {
    const computed = window.getComputedStyle(container);
    if (computed.position === 'static') {
      container.style.position = 'relative';
    }
    layer = container.ownerDocument.createElement('div');
    layer.setAttribute(OVERLAY_LAYER_ATTR, '1');
    layer.className = 'ln-read-aloud-overlay-layer';
    layer.setAttribute('aria-hidden', 'true');
    container.appendChild(layer);
  }
  return layer;
}

function clearOverlayLayer(container: HTMLElement | null | undefined): void {
  if (!container) return;
  const layer = container.querySelector<HTMLElement>(`:scope > [${OVERLAY_LAYER_ATTR}]`);
  if (layer) layer.replaceChildren();
}

function paintRangeOverlays(
  container: HTMLElement,
  range: Range | null,
  className: string
): DOMRect | null {
  if (!range) return null;
  const layer = ensureOverlayLayer(container);
  const cRect = container.getBoundingClientRect();
  const scrollLeft = container.scrollLeft || 0;
  const scrollTop = container.scrollTop || 0;
  let first: DOMRect | null = null;
  const underline = className.includes('current') || className.includes('underline');

  const rects = Array.from(range.getClientRects());
  for (const rect of rects) {
    if (rect.width < 0.5 || rect.height < 0.5) continue;
    const el = container.ownerDocument.createElement('div');
    el.className = className;
    el.style.left = `${rect.left - cRect.left + scrollLeft}px`;
    if (underline) {
      const thickness = Math.max(2, Math.min(3, Math.round(rect.height * 0.12)));
      el.style.top = `${rect.bottom - cRect.top + scrollTop - thickness}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${thickness}px`;
    } else {
      el.style.top = `${rect.top - cRect.top + scrollTop}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${Math.max(rect.height, 2)}px`;
    }
    layer.appendChild(el);
    if (!first) first = rect;
  }
  return first;
}

/** Clone the current selection range if it is non-empty and inside `root`. */
export function cloneSelectionRangeInRoot(root: Node | null | undefined): Range | null {
  if (!root || typeof window === 'undefined') return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const common = range.commonAncestorContainer;
  const node = common.nodeType === Node.TEXT_NODE ? common.parentNode : common;
  if (!node || !root.contains(node)) return null;
  try {
    return range.cloneRange();
  } catch {
    return null;
  }
}

/**
 * Build speakable plain text (whitespace collapsed) with a per-character map into DOM text nodes.
 * Matches `toSpeakableText` collapsing so SpeechSynthesis charIndex lines up.
 */
export function buildSpeakableDomMap(
  root: Node | null | undefined,
  limitRange?: Range | null
): DomCharMap | null {
  if (!root || typeof document === 'undefined') return null;

  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const positions: DomCharMap['positions'] = [];
  let text = '';
  let pendingSpace = false;
  let started = false;

  const inLimit = (node: Text, offset: number): boolean => {
    if (!limitRange) return true;
    try {
      const probe = doc.createRange();
      probe.setStart(node, offset);
      probe.setEnd(node, Math.min(offset + 1, node.data.length));
      const afterStart = probe.compareBoundaryPoints(Range.START_TO_START, limitRange) >= 0;
      const beforeEnd = probe.compareBoundaryPoints(Range.END_TO_START, limitRange) < 0;
      return afterStart && beforeEnd;
    } catch {
      return true;
    }
  };

  let node: Node | null = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    // Skip text inside our own overlay layer if walker ever hits it (shouldn't).
    if (textNode.parentElement?.closest(`[${OVERLAY_LAYER_ATTR}]`)) {
      node = walker.nextNode();
      continue;
    }
    const value = textNode.data || '';
    for (let i = 0; i < value.length; i++) {
      if (!inLimit(textNode, i)) continue;
      const ch = value[i];
      if (/\s/.test(ch)) {
        if (started) pendingSpace = true;
        continue;
      }
      if (pendingSpace) {
        text += ' ';
        positions.push({ node: textNode, offset: i });
        pendingSpace = false;
      }
      text += ch;
      positions.push({ node: textNode, offset: i });
      started = true;
    }
    node = walker.nextNode();
  }

  return text ? { text, positions } : null;
}

export function rangeFromDomMap(
  map: DomCharMap,
  start: number,
  end: number
): Range | null {
  if (!map.positions.length) return null;
  const lo = Math.max(0, Math.min(start, map.positions.length - 1));
  const hiExclusive = Math.max(lo + 1, Math.min(end, map.positions.length));
  const hi = hiExclusive - 1;
  const a = map.positions[lo];
  const b = map.positions[hi];
  if (!a || !b) return null;
  try {
    const doc = a.node.ownerDocument || document;
    const range = doc.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, Math.min(b.offset + 1, b.node.data.length));
    return range;
  } catch {
    return null;
  }
}

export function clearReadAloudHighlight(container?: HTMLElement | null): void {
  clearCssHighlights();
  if (container) clearOverlayLayer(container);
}

/**
 * Highlight only the current spoken word/phrase (no trail left behind).
 */
export function applyReadAloudTrail(
  container: HTMLElement | null | undefined,
  map: DomCharMap | null | undefined,
  charIndex: number,
  charLength: number
): void {
  if (!container || !map || !map.text) {
    clearReadAloudHighlight(container);
    return;
  }

  const idx = Math.max(0, Math.min(charIndex, map.text.length));
  const len = Math.max(1, charLength || 1);
  const wordEnd = Math.min(idx + len, map.text.length);
  const current = rangeFromDomMap(map, idx, wordEnd);

  clearOverlayLayer(container);
  const currentRect = paintRangeOverlays(container, current, 'ln-read-aloud-overlay-current');

  clearCssHighlights();
  try {
    if (supportsCssHighlight() && current) {
      CSS.highlights.set(READ_ALOUD_CURRENT_NAME, new Highlight(current));
    }
  } catch {
    // Ignore
  }

  if (currentRect && typeof current?.startContainer !== 'undefined') {
    try {
      const node = current.startContainer.nodeType === Node.TEXT_NODE
        ? current.startContainer.parentElement
        : (current.startContainer as Element);
      node?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    } catch {
      // Ignore
    }
  }
}

/** @deprecated Use applyReadAloudTrail(container, ...) */
export function applyReadAloudHighlight(range: Range | null | undefined): void {
  if (!range || typeof window === 'undefined') return;
  try {
    if (supportsCssHighlight()) {
      CSS.highlights.set(READ_ALOUD_HIGHLIGHT_NAME, new Highlight(range));
    }
  } catch {
    // Ignore
  }
}
