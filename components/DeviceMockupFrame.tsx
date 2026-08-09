import React from 'react';

/** Visual shell families — inspired by react-device-mockup cosmetics (pure CSS, no assets). */
export type DeviceMockupVariant =
  | 'iphone-island'
  | 'iphone-notch'
  | 'iphone-legacy'
  | 'android'
  | 'android-tablet'
  | 'ipad'
  | 'watch-square'
  | 'watch-round';

export interface DeviceMockupFrameProps {
  variant: DeviceMockupVariant;
  /** Logical CSS viewport width of the screen content */
  width: number;
  /** Logical CSS viewport height of the screen content */
  height: number;
  /** Visual scale of the entire mockup */
  scale?: number;
  className?: string;
  children: React.ReactNode;
}

const BEZEL: Record<DeviceMockupVariant, number> = {
  'iphone-island': 12,
  'iphone-notch': 12,
  'iphone-legacy': 14,
  android: 10,
  'android-tablet': 14,
  ipad: 16,
  'watch-square': 12,
  'watch-round': 16,
};

function ShellChrome({ variant }: { variant: DeviceMockupVariant }) {
  if (variant === 'iphone-island') {
    return (
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none" aria-hidden>
        <div className="w-[92px] h-[26px] rounded-full bg-black flex items-center justify-end pr-2.5 gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-800 ring-1 ring-slate-700/80" />
        </div>
      </div>
    );
  }
  if (variant === 'iphone-notch') {
    return (
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 pointer-events-none" aria-hidden>
        <div className="w-[126px] h-[26px] bg-black rounded-b-2xl" />
      </div>
    );
  }
  if (variant === 'iphone-legacy') {
    return (
      <>
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none" aria-hidden>
          <div className="w-14 h-1.5 rounded-full bg-slate-700/90" />
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none" aria-hidden>
          <div className="w-9 h-9 rounded-full border-2 border-slate-600/70" />
        </div>
      </>
    );
  }
  if (variant === 'android') {
    return (
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none" aria-hidden>
        <div className="w-3 h-3 rounded-full bg-slate-900 ring-2 ring-slate-700/60" />
      </div>
    );
  }
  if (variant === 'ipad' || variant === 'android-tablet') {
    return (
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none" aria-hidden>
        <div className="w-2 h-2 rounded-full bg-slate-700" />
      </div>
    );
  }
  if (variant === 'watch-square') {
    return (
      <div
        className="absolute top-1/3 -right-1 z-30 pointer-events-none w-2.5 h-7 rounded-full bg-slate-600 shadow"
        aria-hidden
      />
    );
  }
  if (variant === 'watch-round') {
    return (
      <>
        <div
          className="absolute top-[28%] -right-1 z-30 pointer-events-none w-2 h-5 rounded-md bg-slate-600 shadow"
          aria-hidden
        />
        <div
          className="absolute top-[48%] -right-0.5 z-30 pointer-events-none w-1.5 h-3.5 rounded-md bg-slate-500 shadow"
          aria-hidden
        />
      </>
    );
  }
  return null;
}

export const DeviceMockupFrame: React.FC<DeviceMockupFrameProps> = ({
  variant,
  width,
  height,
  scale = 1,
  className = '',
  children,
}) => {
  const bezel = BEZEL[variant];
  const isRound = variant === 'watch-round';
  const isWatch = variant === 'watch-square' || variant === 'watch-round';
  const isLegacyPhone = variant === 'iphone-legacy';
  const outerRadius = isRound
    ? 'rounded-full'
    : isWatch
      ? 'rounded-[2.25rem]'
      : variant.startsWith('iphone')
        ? isLegacyPhone
          ? 'rounded-[2.4rem]'
          : 'rounded-[2.75rem]'
        : variant === 'ipad' || variant === 'android-tablet'
          ? 'rounded-[1.75rem]'
          : 'rounded-[2.2rem]';

  const screenRadius = isRound
    ? 'rounded-full'
    : isWatch
      ? 'rounded-[1.75rem]'
      : variant.startsWith('iphone')
        ? isLegacyPhone
          ? 'rounded-[1.75rem]'
          : 'rounded-[2.15rem]'
        : variant === 'ipad' || variant === 'android-tablet'
          ? 'rounded-xl'
          : 'rounded-[1.85rem]';

  const frameWidth = width + bezel * 2 + (isWatch ? 8 : 0);
  const frameHeight = height + bezel * 2 + (isLegacyPhone ? 18 : 0);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{
        width: frameWidth * scale,
        height: frameHeight * scale,
      }}
    >
      <div
        className={`absolute top-0 left-0 origin-top-left bg-slate-950 shadow-2xl ring-1 ring-slate-700/80 ${outerRadius}`}
        style={{
          width: frameWidth,
          height: frameHeight,
          transform: `scale(${scale})`,
          padding: bezel,
          paddingBottom: isLegacyPhone ? bezel + 18 : bezel,
        }}
      >
        {/* Side buttons (phones) */}
        {(variant.startsWith('iphone') || variant === 'android') && (
          <>
            <div
              className="absolute left-0 top-[18%] w-[3px] h-8 -translate-x-[2px] rounded-l-sm bg-slate-700"
              aria-hidden
            />
            <div
              className="absolute left-0 top-[28%] w-[3px] h-12 -translate-x-[2px] rounded-l-sm bg-slate-700"
              aria-hidden
            />
            <div
              className="absolute right-0 top-[24%] w-[3px] h-16 translate-x-[2px] rounded-r-sm bg-slate-700"
              aria-hidden
            />
          </>
        )}

        <ShellChrome variant={variant} />

        <div
          className={`relative z-0 overflow-hidden bg-white ${screenRadius}`}
          style={{ width, height }}
        >
          {children}
        </div>

        {isRound && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none z-40"
            style={{
              boxShadow:
                'inset 0 0 0 14px #0f172a, inset 0 0 0 16px rgba(100,116,139,0.5), inset 0 0 16px 2px rgba(0,0,0,0.4)',
            }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
};

export default DeviceMockupFrame;
