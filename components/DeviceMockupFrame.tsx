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
  | 'zebra-handheld'
  | 'zebra-tc73'
  | 'zebra-tc58'
  | 'zebra-tc52ax'
  | 'zebra-et60'
  | 'zebra-et51'
  | 'zebra-mc3300'
  | 'zebra-mc9300';

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

export function isZebraVariant(variant: DeviceMockupVariant): boolean {
  return variant === 'zebra-handheld' || variant.startsWith('zebra-');
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
  'zebra-tc73': 16,
  'zebra-tc58': 14,
  'zebra-tc52ax': 15,
  'zebra-et60': 22,
  'zebra-et51': 20,
  'zebra-mc3300': 12,
  'zebra-mc9300': 14,
};

/** Extra chrome outside the screen (scanner head / keypad / tablet nav). */
const EXTRA_TOP: Record<DeviceMockupVariant, number> = {
  'iphone-island': 0,
  'iphone-notch': 0,
  'iphone-legacy': 0,
  android: 0,
  'android-tablet': 0,
  ipad: 0,
  'watch-square': 0,
  'watch-round': 0,
  'zebra-handheld': 56,
  'zebra-tc73': 28,
  'zebra-tc58': 26,
  'zebra-tc52ax': 28,
  'zebra-et60': 28,
  'zebra-et51': 26,
  'zebra-mc3300': 22,
  'zebra-mc9300': 26,
};

const EXTRA_BOTTOM: Record<DeviceMockupVariant, number> = {
  'iphone-island': 0,
  'iphone-notch': 0,
  'iphone-legacy': 18,
  android: 0,
  'android-tablet': 0,
  ipad: 0,
  'watch-square': 0,
  'watch-round': 0,
  'zebra-handheld': 16,
  'zebra-tc73': 22,
  'zebra-tc58': 36,
  'zebra-tc52ax': 18,
  'zebra-et60': 36,
  'zebra-et51': 10,
  'zebra-mc3300': 148,
  'zebra-mc9300': 156,
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

function ZebraLogo({ light = false }: { light?: boolean }) {
  return (
    <div
      className={`text-[9px] font-black tracking-[0.22em] uppercase select-none ${
        light ? 'text-slate-600' : 'text-slate-300'
      }`}
      aria-hidden
    >
      Zebra
    </div>
  );
}

function ZebraScannerHead({ width }: { width: number }) {
  return (
    <div
      className="relative shrink-0 rounded-t-[1.1rem] overflow-hidden"
      style={{ width: width + 28, height: 56 }}
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#ffd100] via-[#f5c400] to-[#c9a000]" />
      <div className="absolute inset-x-0 bottom-0 h-3 bg-slate-950" />
      <div className="absolute left-1/2 top-2.5 -translate-x-1/2 w-[62%] h-7 rounded-md bg-slate-900/90 border border-slate-700 shadow-inner flex items-center justify-center gap-1">
        <div className="w-[70%] h-2.5 rounded-sm bg-red-500/25 border border-red-400/30" />
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
      </div>
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

function McKeypad({ armored }: { armored?: boolean }) {
  const keys = [
    ['F1', 'F2', 'F3'],
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
  ];
  return (
    <div className={`mt-2 rounded-xl px-2.5 pb-2.5 pt-2 ${armored ? 'bg-slate-900 ring-1 ring-slate-600' : 'bg-slate-800/90'}`} aria-hidden>
      <div className="mx-auto mb-2 h-7 w-14 rounded-md bg-[#ffd100] border border-yellow-600 shadow-inner shadow-yellow-700/40 flex items-center justify-center">
        <span className="text-[9px] font-black text-slate-900 tracking-wide">SCAN</span>
      </div>
      <div className="grid gap-1">
        {keys.map((row, ri) => (
          <div key={ri} className="grid grid-cols-3 gap-1">
            {row.map((k) => (
              <div
                key={k}
                className={`h-6 rounded-md text-[9px] font-semibold flex items-center justify-center ${
                  ri === 0
                    ? 'bg-sky-700/80 text-sky-50'
                    : 'bg-slate-100 text-slate-800 border border-slate-300'
                }`}
              >
                {k}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ZebraFrameShell({
  variant,
  width,
  height,
  bezel,
  children,
}: {
  variant: DeviceMockupVariant;
  width: number;
  height: number;
  bezel: number;
  children: React.ReactNode;
}) {
  const frameWidth = width + bezel * 2 + 4;

  if (variant === 'zebra-handheld') {
    return (
      <>
        <ZebraScannerHead width={width} />
        <div
          className="relative bg-slate-950 ring-1 ring-slate-700/90 rounded-[1.35rem] rounded-t-none flex flex-col"
          style={{ width: frameWidth, padding: bezel, paddingTop: bezel - 2, marginTop: -2 }}
        >
          <div className="absolute -top-0.5 -left-0.5 w-5 h-5 rounded-tl-xl border-t-4 border-l-4 border-[#ffd100] pointer-events-none" />
          <div className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-tr-xl border-t-4 border-r-4 border-[#ffd100] pointer-events-none" />
          <div className="absolute -bottom-0.5 -left-0.5 w-5 h-5 rounded-bl-xl border-b-4 border-l-4 border-[#ffd100] pointer-events-none" />
          <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-br-xl border-b-4 border-r-4 border-[#ffd100] pointer-events-none" />
          <div className="absolute left-0 top-[22%] w-2.5 h-14 -translate-x-[90%] rounded-l-md bg-[#ffd100] border border-yellow-600 shadow" />
          <div className="absolute right-0 top-[22%] w-2.5 h-14 translate-x-[90%] rounded-r-md bg-[#ffd100] border border-yellow-600 shadow" />
          <div className="absolute left-0 top-[48%] w-1.5 h-8 -translate-x-[70%] rounded-l-sm bg-slate-600" />
          <div className="absolute right-0 top-[48%] w-1.5 h-10 translate-x-[70%] rounded-r-sm bg-slate-600" />
          <div className="relative z-0 overflow-hidden bg-white rounded-lg" style={{ width, height }}>
            {children}
          </div>
          <div className="mt-2 h-1.5 w-16 mx-auto rounded-full bg-slate-700/80" />
        </div>
      </>
    );
  }

  if (variant === 'zebra-tc73') {
    return (
      <div
        className="relative bg-gradient-to-b from-slate-900 via-slate-950 to-black rounded-[1.15rem] ring-1 ring-slate-600/80 shadow-xl"
        style={{ width: frameWidth + 10, padding: bezel }}
      >
        {/* Reinforced bumper flares */}
        <div className="absolute -left-1 top-6 bottom-6 w-2 rounded-l-lg bg-slate-800 ring-1 ring-slate-600" />
        <div className="absolute -right-1 top-6 bottom-6 w-2 rounded-r-lg bg-slate-800 ring-1 ring-slate-600" />
        <div className="absolute left-0 top-[20%] w-2 h-10 -translate-x-[85%] rounded-l-md bg-slate-700" />
        <div className="absolute left-0 top-[38%] w-2 h-8 -translate-x-[85%] rounded-l-md bg-slate-700" />
        <div className="absolute right-0 top-[24%] w-2 h-12 translate-x-[85%] rounded-r-md bg-slate-700" />
        <div className="flex justify-center mb-2">
          <ZebraLogo />
        </div>
        <div className="relative overflow-hidden bg-white rounded-xl ring-1 ring-slate-700" style={{ width, height }}>
          {children}
        </div>
        <div className="mt-2.5 h-3 rounded-md bg-slate-800/90" />
      </div>
    );
  }

  if (variant === 'zebra-tc58') {
    return (
      <div className="relative" style={{ width: frameWidth + 6 }}>
        <div
          className="relative bg-slate-950 rounded-t-[1.85rem] rounded-b-none ring-1 ring-slate-700 pt-2 px-[14px] pb-2"
          style={{ paddingLeft: bezel, paddingRight: bezel }}
        >
          <div className="flex justify-center mb-2">
            <ZebraLogo />
          </div>
          <div className="relative overflow-hidden bg-white rounded-2xl" style={{ width, height }}>
            {children}
          </div>
        </div>
        {/* Light grey / white chin */}
        <div
          className="rounded-b-[1.85rem] bg-gradient-to-b from-slate-200 to-slate-100 ring-1 ring-slate-300 px-4 py-3 flex items-center justify-center"
          style={{ width: frameWidth + 6 }}
        >
          <div className="h-1.5 w-14 rounded-full bg-slate-400/70" />
        </div>
      </div>
    );
  }

  if (variant === 'zebra-tc52ax') {
    return (
      <div
        className="relative bg-slate-950 rounded-[1.25rem] ring-1 ring-slate-700 shadow-xl"
        style={{ width: frameWidth + 8, padding: bezel }}
      >
        <div className="absolute -left-0.5 -top-0.5 w-4 h-4 rounded-tl-lg border-t-[3px] border-l-[3px] border-slate-500" />
        <div className="absolute -right-0.5 -top-0.5 w-4 h-4 rounded-tr-lg border-t-[3px] border-r-[3px] border-slate-500" />
        <div className="absolute -left-0.5 -bottom-0.5 w-4 h-4 rounded-bl-lg border-b-[3px] border-l-[3px] border-slate-500" />
        <div className="absolute -right-0.5 -bottom-0.5 w-4 h-4 rounded-br-lg border-b-[3px] border-r-[3px] border-slate-500" />
        {/* Prominent yellow trigger */}
        <div className="absolute left-0 top-[28%] w-3 h-16 -translate-x-[95%] rounded-l-md bg-[#ffd100] border border-yellow-600 shadow" />
        <div className="absolute right-0 top-[30%] w-1.5 h-10 translate-x-[80%] rounded-r-sm bg-slate-600" />
        <div className="flex justify-center mb-2">
          <ZebraLogo />
        </div>
        <div className="relative overflow-hidden bg-white rounded-lg ring-1 ring-slate-800" style={{ width, height }}>
          {children}
        </div>
        <div className="mt-2 h-1.5 w-14 mx-auto rounded-full bg-slate-700" />
      </div>
    );
  }

  if (variant === 'zebra-et60') {
    return (
      <div
        className="relative bg-gradient-to-b from-slate-800 to-slate-950 rounded-[1.1rem] ring-2 ring-slate-700 shadow-2xl"
        style={{ width: frameWidth + 8, padding: bezel }}
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-12 -translate-x-[90%] rounded-l-md bg-[#ffd100] border border-yellow-600" />
        <div className="flex justify-center mb-2">
          <ZebraLogo />
        </div>
        <div className="relative overflow-hidden bg-white rounded-md ring-1 ring-slate-900" style={{ width, height }}>
          {children}
        </div>
        <div className="mt-3 flex items-center justify-center gap-3" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-2.5 w-2.5 rounded-full ring-1 ring-slate-500 ${
                i === 2 ? 'bg-slate-300' : 'bg-slate-600'
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'zebra-et51') {
    return (
      <div
        className="relative bg-slate-950 rounded-[1rem] ring-2 ring-slate-700 shadow-2xl"
        style={{ width: frameWidth + 6, padding: bezel }}
      >
        <div className="flex justify-center mb-2">
          <ZebraLogo />
        </div>
        <div className="relative overflow-hidden bg-white rounded-md ring-1 ring-slate-800" style={{ width, height }}>
          {children}
        </div>
      </div>
    );
  }

  if (variant === 'zebra-mc3300' || variant === 'zebra-mc9300') {
    const armored = variant === 'zebra-mc9300';
    return (
      <div className="relative flex flex-col items-center" style={{ width: frameWidth + (armored ? 18 : 12) }}>
        {/* Pistol-grip silhouette hint */}
        <div
          className={`absolute -bottom-8 left-1/2 -translate-x-1/2 w-10 h-16 rounded-b-2xl ${
            armored ? 'bg-slate-800 ring-1 ring-slate-600' : 'bg-slate-700/90'
          }`}
          style={{ clipPath: 'polygon(20% 0, 80% 0, 100% 100%, 0 100%)' }}
          aria-hidden
        />
        <div
          className={`relative rounded-[1.1rem] ring-1 shadow-xl ${
            armored
              ? 'bg-gradient-to-b from-slate-800 via-slate-950 to-black ring-slate-500'
              : 'bg-slate-900 ring-slate-700'
          }`}
          style={{ width: frameWidth + (armored ? 14 : 8), padding: bezel }}
        >
          {armored && (
            <>
              <div className="absolute -left-1 top-8 bottom-24 w-2.5 rounded-l bg-slate-800 ring-1 ring-slate-600" />
              <div className="absolute -right-1 top-8 bottom-24 w-2.5 rounded-r bg-slate-800 ring-1 ring-slate-600" />
            </>
          )}
          <div className="flex justify-center mb-1.5">
            <ZebraLogo />
          </div>
          <div
            className="relative overflow-hidden bg-white rounded-md ring-1 ring-slate-700"
            style={{ width, height }}
          >
            {children}
          </div>
          <McKeypad armored={armored} />
        </div>
      </div>
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
  const extraTop = EXTRA_TOP[variant];
  const extraBottom = EXTRA_BOTTOM[variant];
  const isRound = variant === 'watch-round';
  const isWatch = variant === 'watch-square' || variant === 'watch-round';
  const isLegacyPhone = variant === 'iphone-legacy';
  const isZebra = isZebraVariant(variant);

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

  const sidePad = isZebra ? 14 : isWatch ? 8 : 0;
  const frameWidth = width + bezel * 2 + sidePad;
  const frameHeight = height + bezel * 2 + extraTop + extraBottom + (isLegacyPhone && !isZebra ? 0 : 0);

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
          <ZebraFrameShell variant={variant} width={width} height={height} bezel={bezel}>
            {children}
          </ZebraFrameShell>
        ) : (
          <div
            className="relative w-full h-full"
            style={{
              padding: bezel,
              paddingBottom: isLegacyPhone ? bezel + 18 : bezel,
            }}
          >
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
