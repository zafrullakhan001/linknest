import React from 'react';
import {
  type LinkHealthColorContext,
  type LinkHealthFavFinCorner,
  normalizeLinkHealthFavFinCorner,
} from '../services/linkHealthColors';
import { linkHealthService } from '../services/linkHealthService';
import { useSettings } from '../contexts/SettingsContext';

type LinkHealthStatusDotProps = {
  status: string;
  health?: LinkHealthColorContext | null;
  linkUrl?: string | null;
  title?: string;
  /** Inline dot (default) or corner fin used on Favorite Links cards. */
  variant?: 'dot' | 'corner';
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  colorsSetting?: string | null;
  shapeSetting?: string | null;
  /** Favorite-card fin corner. Defaults to the admin Check Links setting. */
  corner?: LinkHealthFavFinCorner | string | null;
};

const CORNER_FIN_PX: Record<'xs' | 'sm' | 'md', number> = {
  xs: 14,
  sm: 18,
  md: 24,
};

const CORNER_LAYOUT: Record<LinkHealthFavFinCorner, { wrap: string; svg: string }> = {
  'top-left': { wrap: 'absolute -top-px -left-px', svg: '' },
  'top-right': { wrap: 'absolute -top-px -right-px', svg: 'scale-x-[-1]' },
  'bottom-left': { wrap: 'absolute -bottom-px -left-px', svg: 'scale-y-[-1]' },
  'bottom-right': { wrap: 'absolute -bottom-px -right-px', svg: 'scale-x-[-1] scale-y-[-1]' },
};

/**
 * White-shark dorsal-fin tip: hugs the card corner, then tapers with a slight
 * inward curve so the inner edge is sharper than a 45° dog-ear.
 */
const SHARK_FIN_PATH = 'M0 0 H20 Q8 8 0 20 Z';

export const LinkHealthStatusDot: React.FC<LinkHealthStatusDotProps> = ({
  status,
  health,
  linkUrl,
  title,
  variant = 'dot',
  size = 'sm',
  className = '',
  colorsSetting,
  shapeSetting,
  corner,
}) => {
  const { settings } = useSettings();
  const colors = colorsSetting ?? settings.link_health_status_colors;
  const shape = shapeSetting ?? settings.link_health_status_shape;
  const finCorner = normalizeLinkHealthFavFinCorner(
    corner ?? settings.link_health_fav_fin_corner
  );
  const dotStyle = linkHealthService.getHealthDotStyle(status, {
    colorsSetting: colors,
    health,
    linkUrl,
    shapeSetting: shape,
    size,
  });

  if (variant === 'corner') {
    const isPulsing = status === 'checking' || dotStyle.className.includes('animate-pulse');
    const px = CORNER_FIN_PX[size] ?? CORNER_FIN_PX.sm;
    const layout = CORNER_LAYOUT[finCorner];

    return (
      <div
        className={`${layout.wrap} z-20 pointer-events-none ${className}`}
        style={{ width: px, height: px }}
        title={title}
      >
        <svg
          viewBox="0 0 20 20"
          className={`block h-full w-full ${layout.svg} ${isPulsing ? 'animate-pulse' : ''}`}
          aria-hidden
        >
          <path d={SHARK_FIN_PATH} fill={dotStyle.backgroundColor} />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`${dotStyle.className} ${className}`.trim()}
      style={{ backgroundColor: dotStyle.backgroundColor }}
      title={title}
    />
  );
};
