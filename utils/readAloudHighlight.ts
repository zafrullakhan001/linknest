/** Soft trail (already read) + current word highlights. */
export const READ_ALOUD_HIGHLIGHT_NAME = 'ln-read-aloud';
export const READ_ALOUD_TRAIL_NAME = 'ln-read-aloud-trail';
export const READ_ALOUD_CURRENT_NAME = 'ln-read-aloud-current';

export type DomCharMap = {
  text: string;
  /** DOM location for each character in `text` (same length as text). */
  positions: Array<{ node: Text; offset: number }>;
};

export function supportsCssHighlight(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

function setHighlight(name: string, range: Range | null | undefined): void {
  if (!range || typeof window === 'undefined') return;
  try {
    if (supportsCssHighlight()) {
      CSS.highlights.set(name, new Highlight(range));
      return;
    }
  } catch {
    // Fall through
  }
  try {
    const selection =
      range.startContainer.ownerDocument?.defaultView?.getSelection?.() || window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Ignore invalid ranges
  }
}

export function applyReadAloudHighlight(range: Range | null | undefined): void {
  setHighlight(READ_ALOUD_HIGHLIGHT_NAME, range);
}

export function clearReadAloudHighlight(): void {
  if (typeof window === 'undefined') return;
  try {
    if (supportsCssHighlight()) {
      CSS.highlights.delete(READ_ALOUD_HIGHLIGHT_NAME);
      CSS.highlights.delete(READ_ALOUD_TRAIL_NAME);
      CSS.highlights.delete(READ_ALOUD_CURRENT_NAME);
    }
  } catch {
    // Ignore
  }
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
      // Compare endpoints: character is inside if after start and before end.
      const afterStart =
        probe.compareBoundaryPoints(Range.START_TO_START, limitRange) >= 0;
      const beforeEnd = probe.compareBoundaryPoints(Range.END_TO_START, limitRange) < 0;
      return afterStart && beforeEnd;
    } catch {
      return true;
    }
  };

  let node: Node | null = walker.nextNode();
  while (node) {
    const textNode = node as Text;
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
        // Space maps to the upcoming non-space char's position (visual trail continuity).
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
    // End after the last included character
    range.setEnd(b.node, Math.min(b.offset + 1, b.node.data.length));
    return range;
  } catch {
    return null;
  }
}

/**
 * Apply progressive trail (0 → current) and current-word highlight.
 * `charIndex` / `charLength` come from SpeechSynthesis boundary events.
 */
export function applyReadAloudTrail(
  map: DomCharMap | null | undefined,
  charIndex: number,
  charLength: number
): void {
  if (!map || !map.text) {
    clearReadAloudHighlight();
    return;
  }
  const idx = Math.max(0, Math.min(charIndex, map.text.length));
  const len = Math.max(1, charLength || 1);
  const wordEnd = Math.min(idx + len, map.text.length);

  const trail = rangeFromDomMap(map, 0, Math.max(1, wordEnd));
  const current = rangeFromDomMap(map, idx, wordEnd);

  clearReadAloudHighlight();
  if (trail) setHighlight(READ_ALOUD_TRAIL_NAME, trail);
  if (current) setHighlight(READ_ALOUD_CURRENT_NAME, current);
}
