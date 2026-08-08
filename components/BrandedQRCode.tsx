import React from 'react';
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

interface BrandedQRCodeProps {
  value: string;
  size?: number;
  title?: string;
  className?: string;
  /** Logo size relative to QR; defaults scale with size. */
  imageSize?: number;
}

/** Square scannable QR with admin branding (favicon or emoji) in the center. */
export const BrandedQRCode: React.FC<BrandedQRCodeProps> = ({
  value,
  size = 200,
  title,
  className,
  imageSize,
}) => {
  const centerImageSrc = useQrCenterImageSrc();
  const logo = imageSize ?? Math.max(28, Math.round(size * 0.18));

  return (
    <div className={className ?? 'bg-white p-3 rounded-xl'}>
      <QRCodeSVG
        value={value}
        size={size}
        level="H"
        bgColor="#FFFFFF"
        fgColor="#000000"
        marginSize={4}
        title={title}
        imageSettings={{
          src: centerImageSrc,
          height: logo,
          width: logo,
          excavate: true,
        }}
      />
    </div>
  );
};
