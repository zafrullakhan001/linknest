/** Shared helpers for per-link custom broken / lifecycle status badges. */

import type { CSSProperties } from 'react';

export type BrokenStatusTone = 'red' | 'amber' | 'slate';
export type BrokenStatusFontWeight = 'normal' | 'bold';
export type BrokenStatusFontStyle = 'normal' | 'italic';

export const BROKEN_STATUS_PRESETS = ['Retired', 'Retiring', 'Decommissioned'] as const;

export const BROKEN_STATUS_LABEL_MAX_LEN = 48;
export const BROKEN_STATUS_NOTE_MAX_LEN = 160;

export type BrokenStatusFields = {
  brokenStatusLabel?: string | null;
  brokenStatusNote?: string | null;
  brokenStatusTone?: BrokenStatusTone | string | null;
  brokenStatusExpected?: boolean | null;
  brokenStatusManual?: boolean | null;
  brokenStatusFontColor?: string | null;
  brokenStatusFontWeight?: BrokenStatusFontWeight | string | null;
  brokenStatusFontStyle?: BrokenStatusFontStyle | string | null;
  brokenStatusFontFamily?: string | null;
};

export function normalizeBrokenStatusTone(value?: string | null): BrokenStatusTone | undefined {
  const tone = String(value || '').trim().toLowerCase();
  if (tone === 'red' || tone === 'amber' || tone === 'slate') return tone;
  return undefined;
}

export function normalizeBrokenStatusFontColor(value?: string | null): string | undefined {
  const color = String(value || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color)) return color.toLowerCase();
  return undefined;
}

export function normalizeBrokenStatusFontWeight(value?: string | null): BrokenStatusFontWeight | undefined {
  const weight = String(value || '').trim().toLowerCase();
  if (weight === 'normal' || weight === 'bold') return weight;
  return undefined;
}

export function normalizeBrokenStatusFontStyle(value?: string | null): BrokenStatusFontStyle | undefined {
  const style = String(value || '').trim().toLowerCase();
  if (style === 'normal' || style === 'italic') return style;
  return undefined;
}

export function normalizeBrokenStatusFontFamily(value?: string | null): string | undefined {
  const family = String(value || '').trim();
  if (!family || family.toLowerCase() === 'inherit') return undefined;
  if (!/^[a-zA-Z0-9\s,'"\-_]+$/.test(family)) return undefined;
  return family.slice(0, 120).trim() || undefined;
}

export function getBrokenDisplayLabel(link?: BrokenStatusFields | null): string {
  const custom = typeof link?.brokenStatusLabel === 'string' ? link.brokenStatusLabel.trim() : '';
  return custom || 'Broken';
}

export function getBrokenStatusNote(link?: BrokenStatusFields | null): string {
  return typeof link?.brokenStatusNote === 'string' ? link.brokenStatusNote.trim() : '';
}

/** Effective badge tone: explicit tone, else amber when expected/manual lifecycle, else red. */
export function getBrokenStatusTone(link?: BrokenStatusFields | null): BrokenStatusTone {
  const explicit = normalizeBrokenStatusTone(link?.brokenStatusTone ?? null);
  if (explicit) return explicit;
  if (link?.brokenStatusExpected === true || link?.brokenStatusManual === true) return 'amber';
  return 'red';
}

export function shouldShowBrokenStatusBadge(
  link: BrokenStatusFields | null | undefined,
  healthStatus?: string | null
): boolean {
  if (link?.brokenStatusManual === true) {
    const label = typeof link.brokenStatusLabel === 'string' ? link.brokenStatusLabel.trim() : '';
    if (label) return true;
  }
  return healthStatus === 'broken';
}

/** True when broken health is intentional (exclude from surprise/outage counts). */
export function isExpectedBrokenStatus(link?: BrokenStatusFields | null): boolean {
  return link?.brokenStatusExpected === true;
}

export function getBrokenBadgeClassNames(tone: BrokenStatusTone): {
  text: string;
  dot: string;
  rowBg: string;
  rowBorder: string;
} {
  switch (tone) {
    case 'amber':
      return {
        text: 'text-amber-600 dark:text-amber-400',
        dot: 'bg-amber-500',
        rowBg: 'bg-amber-50/50 dark:bg-amber-900/10',
        rowBorder: 'border-amber-300 dark:border-amber-500/50',
      };
    case 'slate':
      return {
        text: 'text-slate-500 dark:text-slate-400',
        dot: 'bg-slate-400',
        rowBg: 'bg-slate-50/60 dark:bg-slate-800/40',
        rowBorder: 'border-slate-300 dark:border-slate-500/50',
      };
    case 'red':
    default:
      return {
        text: 'text-red-500',
        dot: 'bg-red-500',
        rowBg: 'bg-red-50/50 dark:bg-red-900/10',
        rowBorder: 'border-red-300 dark:border-red-500/50',
      };
  }
}

/** Inline typography overrides for the badge label text (not the status dot). */
export function getBrokenBadgeTextStyle(link?: BrokenStatusFields | null): CSSProperties {
  const style: CSSProperties = {};
  const color = normalizeBrokenStatusFontColor(link?.brokenStatusFontColor ?? null);
  const weight = normalizeBrokenStatusFontWeight(link?.brokenStatusFontWeight ?? null);
  const fontStyle = normalizeBrokenStatusFontStyle(link?.brokenStatusFontStyle ?? null);
  const family = normalizeBrokenStatusFontFamily(link?.brokenStatusFontFamily ?? null);
  if (color) style.color = color;
  if (weight) style.fontWeight = weight === 'bold' ? 700 : 400;
  if (fontStyle) style.fontStyle = fontStyle;
  if (family) style.fontFamily = family;
  return style;
}

/** When a custom font color is set, drop the tone text color class so the hex wins. */
export function getBrokenBadgeTextClassNames(
  tone: BrokenStatusTone,
  link?: BrokenStatusFields | null
): string {
  const classes = getBrokenBadgeClassNames(tone);
  const hasCustomColor = !!normalizeBrokenStatusFontColor(link?.brokenStatusFontColor ?? null);
  const hasCustomWeight = !!normalizeBrokenStatusFontWeight(link?.brokenStatusFontWeight ?? null);
  return [
    'text-xs flex items-center gap-1 shrink-0',
    hasCustomColor ? '' : classes.text,
    hasCustomWeight ? '' : 'font-medium',
  ]
    .filter(Boolean)
    .join(' ');
}

export function getBrokenBadgeTitle(
  link?: BrokenStatusFields | null,
  healthError?: string | null
): string {
  const label = getBrokenDisplayLabel(link);
  const note = getBrokenStatusNote(link);
  const parts: string[] = [];
  if (link?.brokenStatusManual === true && note === '') {
    parts.push(`${label} (manual status)`);
  } else if (link?.brokenStatusExpected === true) {
    parts.push(`${label} (expected)`);
  } else {
    parts.push(label);
  }
  if (note) parts.push(note);
  if (healthError) parts.push(healthError);
  return parts.join(' — ');
}
