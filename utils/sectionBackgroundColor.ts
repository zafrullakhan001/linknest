/**
 * Helpers for tab/section card background colors + gradients.
 * Only #RGB / #RRGGBB hex values are accepted (no arbitrary CSS).
 */

/** CSS custom properties consumed by styleService (beats theme !important via var()). */
export const SECTION_CARD_BG_VAR = '--ln-section-card-bg';
export const SECTION_CARD_BORDER_VAR = '--ln-section-card-border-color';

export type SectionGradientType = 'linear' | 'radial';

/** Shared decoration shape for tab defaults and section overrides. */
export interface SectionBackgroundDecoration {
  backgroundColor?: string | null;
  backgroundGradientEnabled?: boolean | null;
  backgroundGradientColors?: string[] | null;
  backgroundGradientDirection?: number | null;
  backgroundGradientType?: SectionGradientType | null;
  backgroundGradientColorPositions?: number[] | null;
}

export interface SectionBgPreset {
  name: string;
  colors: string[];
  direction: number;
  textColor: string;
}

/** Same metallic + colorful presets as tile decoration. */
export const SECTION_BG_PRESETS: SectionBgPreset[] = [
  { name: 'Gold', colors: ['#FFD700', '#FFA500', '#FF8C00'], direction: 135, textColor: '#fff' },
  { name: 'Silver', colors: ['#C0C0C0', '#A8A8A8', '#808080'], direction: 135, textColor: '#000' },
  { name: 'Bronze', colors: ['#CD7F32', '#A0522D', '#8B4513'], direction: 135, textColor: '#fff' },
  { name: 'Chrome', colors: ['#E8E8E8', '#C0C0C0', '#A0A0A0'], direction: 135, textColor: '#000' },
  { name: 'Copper', colors: ['#B87333', '#8B4513', '#654321'], direction: 135, textColor: '#fff' },
  { name: 'Platinum', colors: ['#E5E4E2', '#D3D3D3', '#C0C0C0'], direction: 135, textColor: '#000' },
  { name: 'Rose Gold', colors: ['#E8B4B8', '#D4A5A9', '#C8969A'], direction: 135, textColor: '#fff' },
  { name: 'Titanium', colors: ['#878681', '#6B6B6B', '#4F4F4F'], direction: 135, textColor: '#fff' },
  { name: 'Ocean Blue', colors: ['#0077BE', '#00A8E8', '#005F8C'], direction: 135, textColor: '#fff' },
  { name: 'Sunset', colors: ['#FF6B6B', '#FF8E53', '#FFA07A'], direction: 90, textColor: '#fff' },
  { name: 'Forest', colors: ['#2D5016', '#3D6B2A', '#4A7C3A'], direction: 180, textColor: '#fff' },
  { name: 'Purple Dream', colors: ['#6C5CE7', '#A29BFE', '#FD79A8'], direction: 135, textColor: '#fff' },
  { name: 'Orange Fire', colors: ['#FF5722', '#FF6D00', '#FF8F00'], direction: 90, textColor: '#fff' },
  { name: 'Mint Fresh', colors: ['#00E676', '#1DE9B6', '#00BFA5'], direction: 135, textColor: '#000' },
  { name: 'Cherry Blossom', colors: ['#FFB3BA', '#FFDFBA', '#FFFFBA'], direction: 90, textColor: '#333' },
  { name: 'Midnight', colors: ['#2C3E50', '#34495E', '#1A252F'], direction: 135, textColor: '#fff' },
  { name: 'Lavender', colors: ['#E1BEE7', '#CE93D8', '#BA68C8'], direction: 180, textColor: '#fff' },
  { name: 'Emerald', colors: ['#00C853', '#00E676', '#00B248'], direction: 135, textColor: '#fff' },
  { name: 'Coral Reef', colors: ['#FF6F61', '#FF8E80', '#FFAB91'], direction: 90, textColor: '#fff' },
  { name: 'Sky Blue', colors: ['#42A5F5', '#64B5F6', '#90CAF9'], direction: 180, textColor: '#fff' },
  { name: 'Raspberry', colors: ['#D81B60', '#E91E63', '#F06292'], direction: 135, textColor: '#fff' },
  { name: 'Teal Wave', colors: ['#00897B', '#00ACC1', '#26A69A'], direction: 90, textColor: '#fff' },
  { name: 'Amber Glow', colors: ['#FFC107', '#FFD54F', '#FFECB3'], direction: 135, textColor: '#000' },
  { name: 'Deep Purple', colors: ['#673AB7', '#7E57C2', '#9575CD'], direction: 135, textColor: '#fff' },
  { name: 'Turquoise', colors: ['#009688', '#00BCD4', '#4DD0E1'], direction: 90, textColor: '#fff' },
  { name: 'Peachy', colors: ['#FF9800', '#FFB74D', '#FFCC80'], direction: 180, textColor: '#fff' },
  { name: 'Navy', colors: ['#1565C0', '#1976D2', '#1E88E5'], direction: 135, textColor: '#fff' },
  { name: 'Rose Pink', colors: ['#E91E63', '#F06292', '#F48FB1'], direction: 90, textColor: '#fff' },
];

export interface SoftBackgroundStyle {
  backgroundColor: string;
  borderColor: string;
  color: string;
  baseHex: string;
  cssVars: Record<string, string>;
  isGradient: boolean;
}

const HEX3 = /^#([0-9A-Fa-f]{3})$/;
const HEX6 = /^#([0-9A-Fa-f]{6})$/;

/** Normalize optional hex (#RGB / #RRGGBB) to uppercase #RRGGBB, or null. */
export function normalizeHexColor(value: string | null | undefined): string | null {
  if (value == null) return null;
  let trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed[0] !== '#') trimmed = `#${trimmed}`;
  const m3 = HEX3.exec(trimmed);
  if (m3) {
    const [r, g, b] = m3[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const m6 = HEX6.exec(trimmed);
  if (m6) return `#${m6[1]}`.toUpperCase();
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function mixHex(hex: string, other: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(other);
  if (!a || !b) return normalizeHexColor(hex) || '#FFFFFF';
  const t = Math.max(0, Math.min(1, amount));
  return rgbToHex(
    a.r * t + b.r * (1 - t),
    a.g * t + b.g * (1 - t),
    a.b * t + b.b * (1 - t)
  );
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function readableTextOn(hex: string, dark = '#0f172a', light = '#f8fafc'): string {
  return relativeLuminance(hex) > 0.45 ? dark : light;
}

export function evenlySpacedPositions(count: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => (i / (count - 1)) * 100);
}

export function sanitizeGradientColors(colors: unknown): string[] {
  if (!Array.isArray(colors)) return [];
  return colors.map((c) => normalizeHexColor(typeof c === 'string' ? c : null)).filter((c): c is string => !!c);
}

export function sanitizeGradientPositions(positions: unknown, colorCount: number): number[] {
  if (!Array.isArray(positions) || positions.length !== colorCount) {
    return evenlySpacedPositions(colorCount);
  }
  return positions.map((p, i) => {
    const n = typeof p === 'number' ? p : Number(p);
    if (!Number.isFinite(n)) return evenlySpacedPositions(colorCount)[i] ?? 0;
    return Math.max(0, Math.min(100, n));
  });
}

/** Build CSS gradient string from decoration (or null if not a usable gradient). */
export function buildGradientCss(decoration: SectionBackgroundDecoration | null | undefined): string | null {
  if (!decoration?.backgroundGradientEnabled) return null;
  const colors = sanitizeGradientColors(decoration.backgroundGradientColors);
  if (colors.length < 2) return null;
  const positions = sanitizeGradientPositions(decoration.backgroundGradientColorPositions, colors.length);
  const stops = colors.map((c, i) => `${c} ${positions[i]}%`).join(', ');
  const direction = Number(decoration.backgroundGradientDirection);
  const deg = Number.isFinite(direction) ? direction : 135;
  const type = decoration.backgroundGradientType === 'radial' ? 'radial' : 'linear';
  if (type === 'radial') return `radial-gradient(circle at center, ${stops})`;
  return `linear-gradient(${deg}deg, ${stops})`;
}

export function hasSectionBackground(decoration: SectionBackgroundDecoration | null | undefined): boolean {
  if (!decoration) return false;
  if (decoration.backgroundGradientEnabled && sanitizeGradientColors(decoration.backgroundGradientColors).length >= 2) {
    return true;
  }
  return !!normalizeHexColor(decoration.backgroundColor);
}

/**
 * Section wins over tab when it has any solid color or enabled gradient.
 * Clearing section fields falls back to tab decoration.
 */
export function resolveSectionBackgroundDecoration(
  section: SectionBackgroundDecoration | null | undefined,
  tab: SectionBackgroundDecoration | null | undefined
): SectionBackgroundDecoration | null {
  if (hasSectionBackground(section)) return section || null;
  if (hasSectionBackground(tab)) return tab || null;
  return null;
}

/**
 * Full section-card background from solid or gradient decoration.
 * Custom colors/gradients are light-mode only — dark mode always uses theme defaults.
 */
export function softBackgroundStyleFromDecoration(
  decoration: SectionBackgroundDecoration | null | undefined,
  isDark = false
): SoftBackgroundStyle | null {
  if (isDark || !decoration) return null;

  const gradientCss = buildGradientCss(decoration);
  if (gradientCss) {
    const colors = sanitizeGradientColors(decoration.backgroundGradientColors);
    const mid = colors[Math.floor(colors.length / 2)] || colors[0];
    const border = mixHex(mid, '#cbd5e1', 0.9);
    const color = readableTextOn(mid);
    return {
      backgroundColor: mid,
      borderColor: border,
      color,
      baseHex: mid,
      isGradient: true,
      cssVars: {
        [SECTION_CARD_BG_VAR]: gradientCss,
        [SECTION_CARD_BORDER_VAR]: border,
        // Use shorthand only — do not also set backgroundColor or it can wipe the gradient.
        background: gradientCss,
        backgroundImage: gradientCss,
        borderColor: border,
        color,
      },
    };
  }

  return softBackgroundStyle(decoration.backgroundColor || '', false);
}

/**
 * Full section-card background from a chosen hex (solid pastel).
 * No-op in dark mode — custom fills are light-mode only.
 */
export function softBackgroundStyle(hex: string, isDark = false): SoftBackgroundStyle | null {
  if (isDark) return null;
  const baseHex = normalizeHexColor(hex);
  if (!baseHex) return null;

  const fill = mixHex(baseHex, '#ffffff', 0.88);
  const border = mixHex(baseHex, '#cbd5e1', 0.9);
  const color = readableTextOn(fill);

  return {
    backgroundColor: fill,
    borderColor: border,
    color,
    baseHex,
    isGradient: false,
    cssVars: {
      [SECTION_CARD_BG_VAR]: fill,
      [SECTION_CARD_BORDER_VAR]: border,
      backgroundColor: fill,
      borderColor: border,
      color,
    },
  };
}

/**
 * Resolve the effective solid background for a section card:
 * section override → tab default → none.
 * @deprecated Prefer resolveSectionBackgroundDecoration + softBackgroundStyleFromDecoration
 */
export function resolveSectionBackgroundColor(
  sectionBackgroundColor: string | null | undefined,
  tabBackgroundColor: string | null | undefined
): string | null {
  return normalizeHexColor(sectionBackgroundColor) ?? normalizeHexColor(tabBackgroundColor);
}

export function colorInputValue(hex: string | null | undefined, fallback = '#94a3b8'): string {
  return (normalizeHexColor(hex) ?? fallback).toLowerCase();
}

export function decorationFromPreset(preset: SectionBgPreset): SectionBackgroundDecoration {
  return {
    backgroundColor: preset.colors[0],
    backgroundGradientEnabled: true,
    backgroundGradientType: 'linear',
    backgroundGradientDirection: preset.direction,
    backgroundGradientColors: [...preset.colors],
    backgroundGradientColorPositions: evenlySpacedPositions(preset.colors.length),
  };
}

export function clearBackgroundDecoration(): SectionBackgroundDecoration {
  return {
    backgroundColor: undefined,
    backgroundGradientEnabled: false,
    backgroundGradientColors: undefined,
    backgroundGradientDirection: undefined,
    backgroundGradientType: undefined,
    backgroundGradientColorPositions: undefined,
  };
}

/** Coerce JSON/API booleans (true/false, 0/1, "0"/"1"). */
export function coerceOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === '0' || value === 'false') return false;
  if (value === 1 || value === '1' || value === 'true') return true;
  return undefined;
}

function parseBackgroundStyleBlob(raw: unknown): SectionBackgroundDecoration | null {
  let decoded: Record<string, unknown> | null = null;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        decoded = parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    decoded = raw as Record<string, unknown>;
  }
  if (!decoded || !decoded.gradientEnabled) return null;

  const colors: string[] = [];
  if (Array.isArray(decoded.colors)) {
    for (const c of decoded.colors) {
      const hex = normalizeHexColor(typeof c === 'string' ? c : null);
      if (hex) colors.push(hex);
    }
  }
  if (colors.length < 2) return null;

  const type: SectionGradientType =
    decoded.type === 'radial' ? 'radial' : 'linear';
  let direction =
    typeof decoded.direction === 'number' && Number.isFinite(decoded.direction)
      ? Math.round(decoded.direction)
      : 135;
  if (direction < 0) direction = 0;
  if (direction > 360) direction = 360;

  let positions: number[] | undefined;
  if (Array.isArray(decoded.positions) && decoded.positions.length === colors.length) {
    positions = decoded.positions.map((p) => {
      const n = typeof p === 'number' ? p : Number(p);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(100, n));
    });
  }

  return {
    backgroundColor: colors[0],
    backgroundGradientEnabled: true,
    backgroundGradientColors: colors,
    backgroundGradientDirection: direction,
    backgroundGradientType: type,
    backgroundGradientColorPositions: positions,
  };
}

/**
 * Normalize tab/section background decoration from export JSON or API payloads.
 * Accepts camelCase fields and snake_case / background_style blobs.
 */
export function pickSectionBackgroundDecoration(
  src: Record<string, unknown> | null | undefined
): SectionBackgroundDecoration {
  if (!src || typeof src !== 'object') return {};

  const fromStyle =
    parseBackgroundStyleBlob(src.background_style) ??
    parseBackgroundStyleBlob(src.backgroundStyle);

  const solid =
    normalizeHexColor(
      typeof src.backgroundColor === 'string'
        ? src.backgroundColor
        : typeof src.background_color === 'string'
          ? src.background_color
          : null
    ) ?? undefined;

  let enabled = coerceOptionalBoolean(src.backgroundGradientEnabled);
  if (enabled === undefined && fromStyle) {
    enabled = true;
  }

  let colors: string[] | undefined;
  const colorsRaw = src.backgroundGradientColors;
  if (Array.isArray(colorsRaw)) {
    colors = [];
    for (const c of colorsRaw) {
      const hex = normalizeHexColor(typeof c === 'string' ? c : null);
      if (hex) colors.push(hex);
    }
    if (colors.length === 0) colors = undefined;
  } else if (fromStyle?.backgroundGradientColors) {
    colors = fromStyle.backgroundGradientColors;
  }

  let direction: number | undefined;
  if (typeof src.backgroundGradientDirection === 'number' && Number.isFinite(src.backgroundGradientDirection)) {
    direction = Math.max(0, Math.min(360, Math.round(src.backgroundGradientDirection)));
  } else if (fromStyle?.backgroundGradientDirection != null) {
    direction = fromStyle.backgroundGradientDirection;
  }

  let type: SectionGradientType | undefined;
  if (src.backgroundGradientType === 'radial' || src.backgroundGradientType === 'linear') {
    type = src.backgroundGradientType;
  } else if (fromStyle?.backgroundGradientType) {
    type = fromStyle.backgroundGradientType;
  }

  let positions: number[] | undefined;
  const posRaw = src.backgroundGradientColorPositions;
  if (Array.isArray(posRaw)) {
    positions = posRaw
      .map((p) => (typeof p === 'number' ? p : Number(p)))
      .filter((n) => Number.isFinite(n))
      .map((n) => Math.max(0, Math.min(100, n)));
    if (positions.length === 0) positions = undefined;
  } else if (fromStyle?.backgroundGradientColorPositions) {
    positions = fromStyle.backgroundGradientColorPositions;
  }

  const out: SectionBackgroundDecoration = {};
  const backgroundColor = solid ?? fromStyle?.backgroundColor ?? undefined;
  if (backgroundColor) out.backgroundColor = backgroundColor;

  if (enabled === true && colors && colors.length >= 2) {
    out.backgroundGradientEnabled = true;
    out.backgroundGradientColors = colors;
    out.backgroundGradientDirection = direction ?? 135;
    out.backgroundGradientType = type ?? 'linear';
    if (positions && positions.length === colors.length) {
      out.backgroundGradientColorPositions = positions;
    }
  } else if (enabled === false) {
    out.backgroundGradientEnabled = false;
  }

  return out;
}
