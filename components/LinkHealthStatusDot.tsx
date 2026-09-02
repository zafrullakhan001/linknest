import React from 'react';
import {
  type LinkHealthColorContext,
  normalizeLinkHealthStatusShape,
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
};

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
}) => {
  const { settings } = useSettings();
  const colors = colorsSetting ?? settings.link_health_status_colors;
  const shape = shapeSetting ?? settings.link_health_status_shape;
  const dotStyle = linkHealthService.getHealthDotStyle(status, {
    colorsSetting: colors,
    health,
    linkUrl,
    shapeSetting: shape,
    size,
  });

  if (variant === 'corner') {
    const shapeKey = normalizeLinkHealthStatusShape(shape);
    if (shapeKey === 'diamond') {
      return (
        <div
          className={`absolute -top-[1px] -left-[1px] w-3.5 h-3.5 z-20 pointer-events-none overflow-hidden ${className}`}
          title={title}
        >
          <div
            className={`absolute -top-2 -left-2 w-4 h-4 rotate-45 ${dotStyle.className.includes('animate-pulse') ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: dotStyle.backgroundColor }}
          />
        </div>
      );
    }

    return (
      <div
        className={`absolute top-0 left-0 z-20 pointer-events-none ${dotStyle.className} ${className}`}
        style={{ backgroundColor: dotStyle.backgroundColor }}
        title={title}
      />
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
