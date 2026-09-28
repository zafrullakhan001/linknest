import type { CSSProperties } from 'react';
import { MESSAGE_FONT_FAMILIES, TileMessage } from '../types';

/** Marquee cycle length used when a message has no override. */
export const MARQUEE_SECONDS_CARD = 25;
export const MARQUEE_SECONDS_DETAIL = 35;

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

/** Container style that controls marquee speed via the --marquee-duration CSS variable. */
export const messageMarqueeStyle = (messages: TileMessage[], fallbackSeconds: number): CSSProperties =>
  ({ '--marquee-duration': `${resolveMarqueeSeconds(messages, fallbackSeconds)}s` } as CSSProperties);
