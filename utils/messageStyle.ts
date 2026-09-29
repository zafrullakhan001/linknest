import type { CSSProperties } from 'react';
import { MESSAGE_FONT_FAMILIES, TileMessage } from '../types';

/** Marquee cycle length used when a message has no override (legacy scale, see marqueeLoopSeconds). */
export const MARQUEE_SECONDS_CARD = 25;
export const MARQUEE_SECONDS_DETAIL = 35;

/**
 * The legacy keyframes (`marquee-stock-ticker-*`, replaced by `marquee-seamless` in `index.css`)
 * scrolled the single message copy two track widths during the visible 65% of every cycle, so the
 * old speed was `2W / (0.65 * cycle)`. The seamless loop scrolls exactly one copy width per cycle,
 * so dividing a stored cycle by `2 / 0.65` keeps the same pixels-per-second speed
 * (25s -> 8.125s card, 35s -> 11.375s space page, 90s -> 29.25s) with no blank pause in between.
 */
const LEGACY_VISIBLE_CYCLE_FRACTION = 0.65;
const LEGACY_TRACK_WIDTHS_PER_CYCLE = 2;

/** Seamless loop duration (seconds) for a stored marquee cycle value. */
export const marqueeLoopSeconds = (cycleSeconds: number): number =>
  Math.max(0.5, Number(((cycleSeconds * LEGACY_VISIBLE_CYCLE_FRACTION) / LEGACY_TRACK_WIDTHS_PER_CYCLE).toFixed(3)));

/**
 * Seam gap (px) to insert between one marquee run and the next.
 *
 * Two copies of a message are `pitch` apart, and a copy is only ever on screen together with its
 * previous copy while `pitch < viewportWidth + messageWidth`. Requiring
 * `pitch >= viewportWidth + widestMessageWidth` therefore guarantees that **no message is ever on
 * screen twice at the same time**; subtracting the measured run leaves the spacer to insert.
 *
 * Clamping at 0 keeps the other property too: `pitch <= viewportWidth + runWidth`, so the strip is
 * never completely empty - the next copy starts entering the right edge as the previous copy's
 * tail leaves the left edge (a natural one-after-another scroll, never "catching up to its tail").
 */
export const resolveMarqueeSeamGap = (
  viewportWidth: number,
  widestMessageWidth: number,
  runContentWidth: number
): number => {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(widestMessageWidth) || !Number.isFinite(runContentWidth)) return 0;
  if (viewportWidth <= 0 || widestMessageWidth <= 0 || runContentWidth <= 0) return 0;
  return Math.max(0, Math.ceil(viewportWidth + widestMessageWidth - runContentWidth));
};

/**
 * Loop-duration multiplier for a measured seam gap: adding the gap lengthens the pitch, so the
 * animation has to run proportionally longer to keep the pixels-per-second (the pace the stored
 * `marqueeSeconds` value was tuned to) unchanged.
 */
export const marqueePaceScale = (runContentWidth: number, seamGap: number): number => {
  if (!Number.isFinite(runContentWidth) || runContentWidth <= 0) return 1;
  if (!Number.isFinite(seamGap) || seamGap <= 0) return 1;
  return Number(((runContentWidth + seamGap) / runContentWidth).toFixed(3));
};

/** CSS font stack for a message fontFamily key (undefined = inherit the space font). */
export const resolveMessageFontFamily = (key?: string | null): string | undefined => {
  if (!key || key === 'default') return undefined;
  const entry = MESSAGE_FONT_FAMILIES.find((family) => family.key === key);
  return entry && entry.stack ? entry.stack : undefined;
};

/** Human label for the editor select and message-list badges. */
export const messageFontFamilyLabel = (key?: string | null): string => {
  const entry = MESSAGE_FONT_FAMILIES.find((family) => family.key === key);
  return entry ? entry.label : 'Space default';
};

/** Fields buildMessageTextStyle needs (a full TileMessage also satisfies this). */
export type MessageTextStyleInput = Pick<TileMessage, 'textColor' | 'fontStyle' | 'fontFamily' | 'fontSize'>;

/**
 * Inline text style shared by every surface that renders a message
 * (home-grid card marquee and space-page banner), so the editor preview matches exactly.
 */
export const buildMessageTextStyle = (msg: MessageTextStyleInput): CSSProperties => ({
  ...(msg.textColor ? { '--message-text-color': msg.textColor, color: msg.textColor } : {}),
  fontStyle: msg.fontStyle === 'italic' || msg.fontStyle === 'bold italic' ? 'italic' : undefined,
  fontWeight: msg.fontStyle === 'bold' || msg.fontStyle === 'bold italic' ? 'bold' : undefined,
  fontFamily: resolveMessageFontFamily(msg.fontFamily),
  fontSize: typeof msg.fontSize === 'number' && msg.fontSize > 0 ? `${msg.fontSize}px` : undefined,
} as CSSProperties);

/**
 * Marquee cycle length for a group of messages: the slowest value wins, so a fast value on
 * one message cannot speed up a marquee that other messages share. Un-set values fall back
 * to the surface default (25s cards / 35s space page).
 */
export const resolveMarqueeSeconds = (messages: TileMessage[], fallbackSeconds: number): number => {
  if (messages.length === 0) return fallbackSeconds;
  const values = messages.map((msg) =>
    typeof msg.marqueeSeconds === 'number' && msg.marqueeSeconds > 0 ? msg.marqueeSeconds : fallbackSeconds
  );
  return Math.max(...values);
};

/**
 * Container style that controls the seamless marquee speed via the --marquee-duration CSS variable.
 * Stored values are legacy cycle lengths, converted by `marqueeLoopSeconds` (see above).
 * `paceScale` is the measured seam-gap multiplier from `marqueePaceScale` (1 before measuring).
 */
export const messageMarqueeStyle = (
  messages: TileMessage[],
  fallbackSeconds: number,
  paceScale = 1
): CSSProperties => {
  const loopSeconds = marqueeLoopSeconds(resolveMarqueeSeconds(messages, fallbackSeconds)) * paceScale;
  return { '--marquee-duration': `${Number(loopSeconds.toFixed(3))}s` } as CSSProperties;
};
