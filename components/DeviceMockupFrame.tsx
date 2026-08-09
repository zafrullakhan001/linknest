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
  | 'watch-round'
  | 'zebra-handheld';

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
  'zebra-handheld': 14,
};

/** Extra top stack for enterprise scanner “chimney” (Zebra TC-style). */
const SCANNER_HEAD: Record<DeviceMockupVariant, number> = {
  'iphone-island': 0,
  'iphone-notch': 0,
  'iphone-legacy': 0,
  android: 0,
  'android-tablet': 0,
  ipad: 0,
  'watch-square': 0,
  'watch-round': 0,
  'zebra-handheld': 56,
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

function ZebraScannerHead({ width }: { width: number }) {
  return (
    <div
      className="relative shrink-0 rounded-t-[1.1rem] overflow-hidden"
      style={{ width: width + 28, height: 56 }}
      aria-hidden
    >
      {/* Yellow enterprise accent band */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#ffd100] via-[#f5c400] to-[#c9a000]" />
      <div className="absolute inset-x-0 bottom-0 h-3 bg-slate-950" />
      {/* Scanner window */}
      <div className="absolute left-1/2 top-2.5 -translate-x-1/2 w-[62%] h-7 rounded-md bg-slate-900/90 border border-slate-700 shadow-inner flex items-center justify-center gap-1">
        <div className="w-[70%] h-2.5 rounded-sm bg-red-500/25 border border-red-400/30" />
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" title="scanner ready" />
      </div>
      {/* Speaker / mic slots */}
      <div className="absolute left-3 top-3 flex flex-col gap-0.5">
        <span className="block w-5 h-0.5 rounded bg-slate-800/50" />
        <span className="block w-5 h-0.5 rounded bg-slate-800/50" />
        <span className="block w-5 h-0.5 rounded bg-slate-800/50" />
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-0.5">
        <span className="block w-5 h-0.5 rounded bg-slate-800/50" />
        <span className="block w-5 h-0.5 rounded bg-slate-800/50" />
        <span className="block w-5 h-0.5 rounded bg-slate-800/50" />
      </div>
    </div>
  );
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
  const scannerHead = SCANNER_HEAD[variant];
  const isRound = variant === 'watch-round';
  const isWatch = variant === 'watch-square' || variant === 'watch-round';
  const isLegacyPhone = variant === 'iphone-legacy';
  const isZebra = variant === 'zebra-handheld';

  const outerRadius = isRound
    ? 'rounded-full'
    : isZebra
      ? 'rounded-[1.35rem]'
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
    : isZebra
      ? 'rounded-lg'
      : isWatch
        ? 'rounded-[1.75rem]'
        : variant.startsWith('iphone')
          ? isLegacyPhone
            ? 'rounded-[1.75rem]'
            : 'rounded-[2.15rem]'
          : variant === 'ipad' || variant === 'android-tablet'
            ? 'rounded-xl'
            : 'rounded-[1.85rem]';

  const frameWidth = width + bezel * 2 + (isWatch ? 8 : isZebra ? 4 : 0);
  const frameHeight =
    height + bezel * 2 + scannerHead + (isLegacyPhone ? 18 : 0) + (isZebra ? 8 : 0);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{
        width: frameWidth * scale,
        height: frameHeight * scale,
      }}
    >
      <div
        className={`absolute top-0 left-0 origin-top-left flex flex-col items-center shadow-2xl ${
          isZebra ? '' : `bg-slate-950 ring-1 ring-slate-700/80 ${outerRadius}`
        }`}
        style={{
          width: frameWidth,
          height: frameHeight,
          transform: `scale(${scale})`,
        }}
      >
        {isZebra ? (
          <>
            <ZebraScannerHead width={width} />
            {/* Rugged body */}
            <div
              className={`relative bg-slate-950 ring-1 ring-slate-700/90 ${outerRadius} rounded-t-none flex flex-col`}
              style={{
                width: frameWidth,
                padding: bezel,
                paddingTop: bezel - 2,
                marginTop: -2,
              }}
            >
              {/* Yellow bumper corners */}
              <div className="absolute -top-0.5 -left-0.5 w-5 h-5 rounded-tl-xl border-t-4 border-l-4 border-[#ffd100] pointer-events-none" aria-hidden />
              <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-tr-xl border-t-4 border-r-4 border-[#ffd100] pointer-events-none" aria-hidden />
              <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-bl-xl border-b-4 border-l-4 border-[#ffd100] pointer-events-none" aria-hidden />
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-br-xl border-b-4 border-r-4 border-[#ffd100] pointer-events-none" aria-hidden />

              {/* Side scan triggers */}
              <div
                className="absolute left-0 top-[22%] w-2.5 h-14 -translate-x-[90%] rounded-l-md bg-[#ffd100] border border-yellow-600 shadow"
                aria-hidden
              />
              <div
                className="absolute right-0 top-[22%] w-2.5 h-14 translate-x-[90%] rounded-r-md bg-[#ffd100] border border-yellow-600 shadow"
                aria-hidden
              />
              {/* Volume / function keys */}
              <div
                className="absolute left-0 top-[48%] w-1.5 h-8 -translate-x-[70%] rounded-l-sm bg-slate-600"
                aria-hidden
              />
              <div
                className="absolute right-0 top-[48%] w-1.5 h-10 translate-x-[70%] rounded-r-sm bg-slate-600"
                aria-hidden
              />

              <div
                className={`relative z-0 overflow-hidden bg-white ${screenRadius}`}
                style={{ width, height }}
              >
                {children}
              </div>

              {/* Soft key hint bar under screen */}
              <div className="mt-2 h-1.5 w-16 mx-auto rounded-full bg-slate-700/80" aria-hidden />
            </div>
          </>
        ) : (
          <div
            className="relative w-full h-full"
            style={{
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
        )}
      </div>
    </div>
  );
};

export default DeviceMockupFrame;
