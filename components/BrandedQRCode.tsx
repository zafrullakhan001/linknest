import React, { Component, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSettings } from '../contexts/SettingsContext';

/** Render an emoji as an SVG data URL for QR center branding. */
export function emojiToQrDataUrl(emoji: string): string {
  const raw = (emoji || '❤️').trim() || '❤️';
  const safe = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
        <rect width="64" height="64" fill="#ffffff"/>
        <text x="32" y="46" text-anchor="middle" font-size="42">${safe}</text>
      </svg>`
    )
  );
}

export function useQrCenterImageSrc(): string {
  const { settings } = useSettings();
  const faviconUrl = settings.favicon?.trim() || '';
  const brandingMode = settings.qr_branding_mode === 'emoji' ? 'emoji' : 'favicon';
  const brandingEmoji = settings.qr_branding_emoji?.trim() || '❤️';
  const useFavicon = brandingMode === 'favicon' && !!faviconUrl;
  return useFavicon ? faviconUrl : emojiToQrDataUrl(brandingEmoji);
}

type EccLevel = 'L' | 'M' | 'Q' | 'H';

/** Pick a denser ECC for short URLs; ease capacity for long SharePoint-style URLs. */
export function qrSettingsForValue(value: string, size: number): {
  value: string;
  level: EccLevel;
  includeLogo: boolean;
  logoSize: number;
} {
  const normalized = (value || '').trim() || 'about:blank';
  const len = normalized.length;
  let level: EccLevel = 'H';
  if (len > 900) level = 'L';
  else if (len > 500) level = 'M';
  else if (len > 250) level = 'Q';

  // Logo excavation eats capacity — skip for long payloads so encode succeeds.
  const includeLogo = len <= 400;
  const logoSize = Math.max(24, Math.round(size * (includeLogo ? 0.16 : 0.12)));

  return { value: normalized, level, includeLogo, logoSize };
}

interface BrandedQRCodeProps {
  value: string;
  size?: number;
  title?: string;
  className?: string;
  imageSize?: number;
}

class QrRenderBoundary extends Component<
  { fallback: ReactNode; resetKey: string; children: ReactNode },
  { hasError: boolean; resetKey: string }
> {
  state = { hasError: false, resetKey: '' };

  static getDerivedStateFromError(): Partial<{ hasError: boolean }> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { hasError: boolean; resetKey: string }
  ) {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('QR render failed:', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const QrFallback: React.FC<{ size: number; title?: string }> = ({ size, title }) => (
  <div
    className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500"
    style={{ width: size, height: size }}
    role="img"
    aria-label={title || 'QR code unavailable'}
  >
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 opacity-50">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
    </svg>
    <span className="text-[10px] font-medium px-2 text-center leading-tight">QR unavailable for this URL</span>
  </div>
);

/** Inner SVG that may throw on extreme payloads — wrapped by QrRenderBoundary. */
const BrandedQRCodeSvg: React.FC<{
  value: string;
  size: number;
  level: EccLevel;
  title?: string;
  centerImageSrc: string;
  includeLogo: boolean;
  logoSize: number;
}> = ({ value, size, level, title, centerImageSrc, includeLogo, logoSize }) => (
  <QRCodeSVG
    value={value}
    size={size}
    level={level}
    bgColor="#FFFFFF"
    fgColor="#000000"
    marginSize={4}
    title={title}
    imageSettings={
      includeLogo
        ? {
            src: centerImageSrc,
            height: logoSize,
            width: logoSize,
            excavate: true,
          }
        : undefined
    }
  />
);

/** Square scannable QR with admin branding (favicon or emoji) when capacity allows. */
export const BrandedQRCode: React.FC<BrandedQRCodeProps> = ({
  value,
  size = 200,
  title,
  className,
  imageSize,
}) => {
  const centerImageSrc = useQrCenterImageSrc();
  const cfg = useMemo(() => qrSettingsForValue(value, size), [value, size]);
  const logo = imageSize ?? cfg.logoSize;

  return (
    <div className={className ?? 'bg-white p-3 rounded-xl'}>
      <QrRenderBoundary
        resetKey={`${cfg.value}|${cfg.level}|${cfg.includeLogo}`}
        fallback={<QrFallback size={size} title={title} />}
      >
        <BrandedQRCodeSvg
          value={cfg.value}
          size={size}
          level={cfg.level}
          title={title}
          centerImageSrc={centerImageSrc}
          includeLogo={cfg.includeLogo}
          logoSize={logo}
        />
      </QrRenderBoundary>
    </div>
  );
};
