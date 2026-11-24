/**
 * Check Links / link-health status dot colors.
 * Stored as JSON in settings.link_health_status_colors.
 */

import { urlsMeaningfullyDifferent } from '../utils/redirectChain';

export type LinkHealthColorKey =
  | 'online'
  | 'redirected'
  | 'unknown'
  | 'broken'
  | 'network'
  | 'checking';

export type LinkHealthStatusColors = Record<LinkHealthColorKey, string>;

export type LinkHealthIndicatorShape = 'circle' | 'square' | 'rounded' | 'diamond';

export type LinkHealthFavFinCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const DEFAULT_LINK_HEALTH_STATUS_SHAPE: LinkHealthIndicatorShape = 'circle';

export const DEFAULT_LINK_HEALTH_FAV_FIN_CORNER: LinkHealthFavFinCorner = 'top-left';

export const LINK_HEALTH_SHAPE_OPTIONS: Array<{
  id: LinkHealthIndicatorShape;
  label: string;
  description: string;
}> = [
  { id: 'circle', label: 'Circle', description: 'Classic round dot' },
  { id: 'square', label: 'Square', description: 'Sharp square marker' },
  { id: 'rounded', label: 'Rounded square', description: 'Soft square corners' },
  { id: 'diamond', label: 'Diamond', description: 'Rotated square (45°)' },
];

export const LINK_HEALTH_FAV_FIN_CORNER_OPTIONS: Array<{
  id: LinkHealthFavFinCorner;
  label: string;
  description: string;
}> = [
  { id: 'top-left', label: 'Top left', description: 'Upper-left corner of Favorite Links cards' },
  { id: 'top-right', label: 'Top right', description: 'Upper-right corner of Favorite Links cards' },
  { id: 'bottom-left', label: 'Bottom left', description: 'Lower-left corner of Favorite Links cards' },
  { id: 'bottom-right', label: 'Bottom right', description: 'Lower-right corner of Favorite Links cards' },
];

export const DEFAULT_LINK_HEALTH_STATUS_COLORS: LinkHealthStatusColors = {
  online: '#10b981', // healthy / accessible / restricted (emerald-500)
  redirected: '#f59e0b', // amber-500
  unknown: '#f59e0b', // unknown + timeout
  broken: '#ef4444', // red-500
  network: '#94a3b8', // slate-400
  checking: '#3b82f6', // blue-500
};

export const LINK_HEALTH_COLOR_LABELS: Record<
  LinkHealthColorKey,
  { label: string; description: string }
> = {
  online: {
    label: 'Online',
    description: 'Healthy, accessible, or auth-required links that are reachable',
  },
  redirected: {
    label: 'Redirected',
    description: 'Link followed a redirect (host reachable; may require sign-in)',
  },
  unknown: {
    label: 'Unknown / Timeout',
    description: 'Unsure status or the probe timed out',
  },
  broken: {
    label: 'Broken',
    description: 'Connection failed, DNS/SSL error, or server error',
  },
  network: {
    label: 'Network',
    description: 'Network not reachable (not treated as a broken link)',
  },
  checking: {
    label: 'Checking',
    description: 'Probe in progress',
  },
};

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeHealthColorHex(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!HEX_RE.test(trimmed)) return fallback;
  if (trimmed.length === 4) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return trimmed.toLowerCase();
}

export function parseLinkHealthStatusColors(raw: unknown): LinkHealthStatusColors {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { ...DEFAULT_LINK_HEALTH_STATUS_COLORS };
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { ...DEFAULT_LINK_HEALTH_STATUS_COLORS };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_LINK_HEALTH_STATUS_COLORS };
  }
  const obj = parsed as Record<string, unknown>;
  const out = { ...DEFAULT_LINK_HEALTH_STATUS_COLORS };
  (Object.keys(DEFAULT_LINK_HEALTH_STATUS_COLORS) as LinkHealthColorKey[]).forEach((key) => {
    out[key] = normalizeHealthColorHex(obj[key], DEFAULT_LINK_HEALTH_STATUS_COLORS[key]);
  });
  return out;
}

export function linkHealthStatusColorsToSetting(colors: LinkHealthStatusColors): string {
  const normalized = parseLinkHealthStatusColors(colors);
  return JSON.stringify(normalized);
}

export type LinkHealthColorContext = {
  finalUrl?: string | null;
  redirectCount?: number;
  httpCode?: number | null;
};

/** Map a health status string to a color key. */
export function healthStatusToColorKey(status: string): LinkHealthColorKey {
  switch (status) {
    case 'healthy':
    case 'accessible':
    case 'restricted':
      return 'online';
    case 'broken':
      return 'broken';
    case 'network':
      return 'network';
    case 'redirected':
      return 'redirected';
    case 'checking':
      return 'checking';
    case 'unknown':
    case 'timeout':
    default:
      return 'unknown';
  }
}

/**
 * Color key for rendering dots. Uses redirect metadata when the probe followed redirects
 * but settled on unknown/timeout (common for SSO/login pages).
 */
export function resolveLinkHealthDisplayColorKey(
  status: string,
  health?: LinkHealthColorContext | null,
  linkUrl?: string | null
): LinkHealthColorKey {
  if (status === 'redirected') {
    return 'redirected';
  }

  const redirectCount = health?.redirectCount ?? 0;
  if (redirectCount > 0) {
    return 'redirected';
  }

  const finalUrl = (health?.finalUrl || '').trim();
  const original = (linkUrl || '').trim();
  if (finalUrl && original && urlsMeaningfullyDifferent(original, finalUrl)) {
    return 'redirected';
  }

  const httpCode = health?.httpCode ?? 0;
  if (status === 'timeout' && httpCode >= 300 && httpCode < 400) {
    return 'redirected';
  }

  return healthStatusToColorKey(status);
}

export function resolveLinkHealthColorHex(
  status: string,
  colors?: Partial<LinkHealthStatusColors> | string | null,
  health?: LinkHealthColorContext | null,
  linkUrl?: string | null
): string {
  const resolved = parseLinkHealthStatusColors(colors ?? null);
  return resolved[resolveLinkHealthDisplayColorKey(status, health, linkUrl)];
}

/**
 * Color value for inline styles. Uses CSS vars when no explicit colors override is passed
 * so Admin Settings changes apply without re-reading settings in every component.
 */
export function resolveLinkHealthColorCss(
  status: string,
  colors?: Partial<LinkHealthStatusColors> | string | null,
  health?: LinkHealthColorContext | null,
  linkUrl?: string | null
): string {
  if (colors !== undefined && colors !== null && colors !== '') {
    return resolveLinkHealthColorHex(status, colors, health, linkUrl);
  }
  const key = resolveLinkHealthDisplayColorKey(status, health, linkUrl);
  const fallback = DEFAULT_LINK_HEALTH_STATUS_COLORS[key];
  return `var(--ln-health-${key}, ${fallback})`;
}

export function normalizeLinkHealthStatusShape(value: unknown): LinkHealthIndicatorShape {
  const shape = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    shape === 'circle' ||
    shape === 'square' ||
    shape === 'rounded' ||
    shape === 'diamond'
  ) {
    return shape;
  }
  return DEFAULT_LINK_HEALTH_STATUS_SHAPE;
}

export function normalizeLinkHealthFavFinCorner(value: unknown): LinkHealthFavFinCorner {
  const raw = typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '-') : '';
  if (
    raw === 'top-left' ||
    raw === 'top-right' ||
    raw === 'bottom-left' ||
    raw === 'bottom-right'
  ) {
    return raw;
  }
  if (raw === 'left-top') return 'top-left';
  if (raw === 'right-top') return 'top-right';
  if (raw === 'left-bottom') return 'bottom-left';
  if (raw === 'right-bottom') return 'bottom-right';
  return DEFAULT_LINK_HEALTH_FAV_FIN_CORNER;
}

/** Map a custom broken-badge tone onto Check Links color keys so favorites use admin colors. */
export function brokenToneToHealthStatus(tone: 'red' | 'amber' | 'slate' | string | null | undefined): string {
  if (tone === 'amber') return 'unknown';
  if (tone === 'slate') return 'network';
  return 'broken';
}

/** Tailwind classes for inline status markers (dot variant). */
export function linkHealthIndicatorDotClassName(
  shape?: LinkHealthIndicatorShape | string | null,
  options?: { size?: 'xs' | 'sm' | 'md'; pulsing?: boolean; extra?: string }
): string {
  const size = options?.size ?? 'sm';
  const shapeKey = normalizeLinkHealthStatusShape(shape);
  const sizeClass =
    size === 'xs' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const shapeClass =
    shapeKey === 'square'
      ? 'rounded-none'
      : shapeKey === 'rounded'
        ? 'rounded-[3px]'
        : shapeKey === 'diamond'
          ? 'rounded-[2px] rotate-45 scale-[0.88]'
          : 'rounded-full';
  return [
    sizeClass,
    'shrink-0',
    shapeClass,
    options?.pulsing ? 'animate-pulse' : '',
    options?.extra ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Inline dot style — reads saved settings directly so custom colors always apply. */
export function resolveLinkHealthDotStyle(
  status: string,
  colors?: Partial<LinkHealthStatusColors> | string | null,
  health?: LinkHealthColorContext | null,
  linkUrl?: string | null,
  shape?: LinkHealthIndicatorShape | string | null
): { backgroundColor: string; className: string } {
  return {
    backgroundColor: resolveLinkHealthColorCss(status, colors, health, linkUrl),
    className: linkHealthIndicatorDotClassName(shape, { pulsing: status === 'checking' }),
  };
}

/** CSS custom properties injected on :root for status dots. */
export function linkHealthColorsToCssVars(colors: LinkHealthStatusColors): string {
  const c = parseLinkHealthStatusColors(colors);
  return [
    `--ln-health-online: ${c.online}`,
    `--ln-health-redirected: ${c.redirected}`,
    `--ln-health-unknown: ${c.unknown}`,
    `--ln-health-broken: ${c.broken}`,
    `--ln-health-network: ${c.network}`,
    `--ln-health-checking: ${c.checking}`,
  ].join('; ');
}
