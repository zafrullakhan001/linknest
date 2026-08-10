import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getDisplayUrl } from '../utils/urlDisplay';
import { BrandedQRCode } from './BrandedQRCode';
import { useToast } from './Toast';

interface QRCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  label: string;
}

function stripHtmlTags(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') return content.replace(/<[^>]*>/g, '');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return tempDiv.textContent || tempDiv.innerText || '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getSvgImageHref(imageEl: Element): string {
  return (
    imageEl.getAttribute('href') ||
    imageEl.getAttribute('xlink:href') ||
    imageEl.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
    ''
  );
}

function setSvgImageHref(imageEl: Element, href: string): void {
  imageEl.setAttribute('href', href);
  imageEl.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
  // Older serializers still look for the xlink attribute
  imageEl.setAttribute('xlink:href', href);
}

function finalizeSvgMarkup(svgString: string): string {
  let out = svgString;
  if (!out.includes('xmlns=')) {
    out = out.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!out.includes('xmlns:xlink') && /xlink:/i.test(out)) {
    out = out.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  }
  return out;
}

function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('image').forEach((imageEl) => {
    const href = getSvgImageHref(imageEl);
    if (!href || href.startsWith('data:') || href.startsWith('blob:')) return;
    try {
      const absolute = new URL(href, window.location.href).href;
      setSvgImageHref(imageEl, absolute);
    } catch {
      // keep original href
    }
  });

  return finalizeSvgMarkup(new XMLSerializer().serializeToString(clone));
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    try {
      if (src.startsWith('http://') || src.startsWith('https://')) {
        const url = new URL(src);
        if (url.origin !== window.location.origin) {
          image.crossOrigin = 'anonymous';
        }
      }
    } catch {
      // ignore URL parse errors
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = src;
  });
}

function getSvgPixelSize(svg: SVGSVGElement, fallback = 512): { width: number; height: number } {
  const viewBox = svg.viewBox?.baseVal;
  const width = viewBox?.width || svg.width?.baseVal?.value || Number(svg.getAttribute('width')) || fallback;
  const height = viewBox?.height || svg.height?.baseVal?.value || Number(svg.getAttribute('height')) || fallback;
  return { width: width || fallback, height: height || fallback };
}

type CenterLogo = { href: string; x: number; y: number; width: number; height: number };

function readCenterLogos(svg: SVGSVGElement): CenterLogo[] {
  return Array.from(svg.querySelectorAll('image'))
    .map((imageEl) => {
      const href = getSvgImageHref(imageEl);
      if (!href) return null;
      const x = Number(imageEl.getAttribute('x') || 0);
      const y = Number(imageEl.getAttribute('y') || 0);
      const width = Number(imageEl.getAttribute('width') || 0);
      const height = Number(imageEl.getAttribute('height') || 0);
      if (!(width > 0 && height > 0)) return null;
      try {
        const absolute =
          href.startsWith('data:') || href.startsWith('blob:')
            ? href
            : new URL(href, window.location.href).href;
        return { href: absolute, x, y, width, height };
      } catch {
        return { href, x, y, width, height };
      }
    })
    .filter((item): item is CenterLogo => !!item);
}

async function rasterizeSvgMarkup(markup: string, size: number): Promise<HTMLCanvasElement> {
  const svgBlob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const img = await loadHtmlImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function drawCenterLogos(
  ctx: CanvasRenderingContext2D,
  logos: CenterLogo[],
  svgSize: { width: number; height: number },
  outputSize: number
): Promise<void> {
  const scaleX = outputSize / svgSize.width;
  const scaleY = outputSize / svgSize.height;

  for (const logo of logos) {
    try {
      const image = await loadHtmlImage(logo.href);
      const dx = logo.x * scaleX;
      const dy = logo.y * scaleY;
      const dw = logo.width * scaleX;
      const dh = logo.height * scaleY;
      const pad = Math.max(2, Math.round(Math.min(dw, dh) * 0.08));
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(dx - pad, dy - pad, dw + pad * 2, dh + pad * 2);
      ctx.drawImage(image, dx, dy, dw, dh);
    } catch {
      // Skip a logo that cannot be loaded; QR itself is still useful.
    }
  }
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const value = (text || '').trim();
  if (!value) return [];

  // Prefer wrapping on separators so URLs stay readable.
  const tokens = value.split(/(\s+|\/|_|-|\?|&|=)/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current) lines.push(current);
    current = '';
  };

  for (const token of tokens) {
    const next = current + token;
    if (current && ctx.measureText(next).width > maxWidth) {
      pushCurrent();
      // Hard-break extremely long tokens (no separators).
      if (ctx.measureText(token).width > maxWidth) {
        let chunk = '';
        for (const ch of token) {
          const probe = chunk + ch;
          if (chunk && ctx.measureText(probe).width > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = probe;
          }
        }
        current = chunk;
      } else {
        current = token.trimStart();
      }
    } else {
      current = next;
    }
  }
  pushCurrent();
  return lines;
}

type QrExportCaption = {
  title?: string;
  url?: string;
};

/**
 * Rasterize QR to PNG. Nested <image> tags are stripped first (SVG-as-<img>
 * often drops them), then center logos are composited onto the canvas.
 * Optional caption adds title + link under the QR for shared images.
 */
async function svgElementToPngDataUrl(
  svg: SVGSVGElement,
  size = 512,
  caption?: QrExportCaption
): Promise<string> {
  const logos = readCenterLogos(svg);
  const svgSize = getSvgPixelSize(svg, size);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('image').forEach((el) => el.remove());
  // Explicit size helps SVG-as-<img> rasterizers.
  clone.setAttribute('width', String(svgSize.width));
  clone.setAttribute('height', String(svgSize.height));
  if (!clone.getAttribute('viewBox')) {
    clone.setAttribute('viewBox', `0 0 ${svgSize.width} ${svgSize.height}`);
  }
  const markup = finalizeSvgMarkup(new XMLSerializer().serializeToString(clone));

  const qrCanvas = await rasterizeSvgMarkup(markup, size);
  const qrCtx = qrCanvas.getContext('2d');
  if (!qrCtx) throw new Error('Canvas unavailable');
  await drawCenterLogos(qrCtx, logos, svgSize, size);

  const title = (caption?.title || '').trim();
  const link = (caption?.url || '').trim();
  const hasCaption = !!(title || link);

  if (!hasCaption) {
    try {
      return qrCanvas.toDataURL('image/png');
    } catch (err) {
      throw new Error(
        err instanceof Error ? `PNG export blocked: ${err.message}` : 'PNG export blocked'
      );
    }
  }

  const padX = Math.round(size * 0.06);
  const padTop = Math.round(size * 0.05);
  const padBottom = Math.round(size * 0.06);
  const gapAfterQr = Math.round(size * 0.045);
  const titleSize = Math.max(18, Math.round(size * 0.045));
  const urlSize = Math.max(14, Math.round(size * 0.032));
  const lineGap = Math.round(urlSize * 0.35);
  const textWidth = size - padX * 2;

  // Measure caption height on a temporary context.
  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  if (!measureCtx) throw new Error('Canvas unavailable');

  let titleLines: string[] = [];
  let urlLines: string[] = [];
  let captionHeight = gapAfterQr;

  if (title) {
    measureCtx.font = `600 ${titleSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    titleLines = wrapCanvasText(measureCtx, title, textWidth);
    captionHeight += titleLines.length * (titleSize + lineGap) + Math.round(titleSize * 0.35);
  }
  if (link) {
    measureCtx.font = `500 ${urlSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    urlLines = wrapCanvasText(measureCtx, link, textWidth);
    captionHeight += urlLines.length * (urlSize + lineGap);
  }

  const out = document.createElement('canvas');
  out.width = size;
  out.height = padTop + size + captionHeight + padBottom;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(qrCanvas, 0, padTop, size, size);

  let textY = padTop + size + gapAfterQr;

  if (titleLines.length) {
    ctx.fillStyle = '#0f172a';
    ctx.font = `600 ${titleSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const line of titleLines) {
      ctx.fillText(line, size / 2, textY, textWidth);
      textY += titleSize + lineGap;
    }
    textY += Math.round(titleSize * 0.2);
  }

  if (urlLines.length) {
    ctx.fillStyle = '#64748b';
    ctx.font = `500 ${urlSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const line of urlLines) {
      ctx.fillText(line, size / 2, textY, textWidth);
      textY += urlSize + lineGap;
    }
  }

  try {
    return out.toDataURL('image/png');
  } catch (err) {
    throw new Error(
      err instanceof Error ? `PNG export blocked: ${err.message}` : 'PNG export blocked'
    );
  }
}

async function svgElementToPngBlob(
  svg: SVGSVGElement,
  size = 512,
  caption?: QrExportCaption
): Promise<Blob> {
  const dataUrl = await svgElementToPngDataUrl(svg, size, caption);
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'image/png' });
}

function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

async function copyImageBlobToClipboard(blob: Blob): Promise<boolean> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return false;
  try {
    // Some browsers require a Promise-typed ClipboardItem value.
    const item = new ClipboardItem({
      'image/png': Promise.resolve(blob),
    });
    await navigator.clipboard.write([item]);
    return true;
  } catch {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }
}

async function deliverQrImage(blob: Blob, filename: string, title: string): Promise<'shared' | 'copied' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const fileShare: ShareData = { files: [file], title };

  // Prefer native file share when available. Do not include url/text — chat apps
  // then unfurl a link preview instead of showing the QR image.
  try {
    if (typeof navigator.canShare === 'function' && navigator.canShare(fileShare) && typeof navigator.share === 'function') {
      await navigator.share(fileShare);
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Fall through — desktop browsers often reject share after async work.
  }

  if (await copyImageBlobToClipboard(blob)) {
    return 'copied';
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}

function safeQrFilename(label: string): string {
  const base = (label || 'qr-code')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${base || 'qr-code'}.png`;
}

function buildPrintHtml(opts: {
  title: string;
  url: string;
  qrMarkup: string;
}): string {
  const safeTitle = escapeHtml(opts.title);
  const safeUrl = escapeHtml(opts.url);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <base href="${escapeHtml(typeof window !== 'undefined' ? window.location.href.split('#')[0] : '/')}" />
  <title>QR Code — ${safeTitle}</title>
  <style>
    @page { margin: 1.5cm; }
    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #0f172a;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .sheet {
      text-align: center;
      max-width: 420px;
      padding: 24px;
    }
    h1 {
      font-size: 20px;
      margin: 0 0 8px;
      font-weight: 700;
    }
    .qr {
      margin: 16px auto;
      width: 280px;
      height: 280px;
    }
    .qr svg {
      width: 280px !important;
      height: 280px !important;
      display: block;
    }
    .url {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      color: #64748b;
      word-break: break-all;
      margin: 0 0 8px;
    }
    .hint {
      font-size: 12px;
      color: #94a3b8;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>${safeTitle}</h1>
    <div class="qr" id="qr-wrap">${opts.qrMarkup}</div>
    <p class="url">${safeUrl}</p>
    <p class="hint">Scan with your phone camera to open this link</p>
  </div>
</body>
</html>`;
}

function printHtmlDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const cleanup = () => {
      try {
        iframe.remove();
      } catch {
        // ignore
      }
    };

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!win || !doc) {
      cleanup();
      reject(new Error('Unable to create print frame'));
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    let printed = false;
    const runPrint = () => {
      if (printed) return;
      printed = true;
      try {
        win.focus();
        win.print();
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Print failed'));
      } finally {
        // Give the print dialog a moment before removing the frame
        window.setTimeout(cleanup, 1000);
      }
    };

    const htmlImages = Array.from(doc.images);
    const svgImages = Array.from(doc.querySelectorAll('image'));
    const pendingTargets: Array<{ complete?: boolean; addEventListener: EventTarget['addEventListener'] }> = [
      ...htmlImages,
      ...svgImages,
    ];

    if (pendingTargets.length === 0) {
      window.setTimeout(runPrint, 100);
      return;
    }

    let pending = pendingTargets.length;
    const onOneDone = () => {
      pending -= 1;
      if (pending <= 0) window.setTimeout(runPrint, 50);
    };

    pendingTargets.forEach((img) => {
      // HTMLImageElement has complete; SVGImageElement does not reliably
      if ('complete' in img && (img as HTMLImageElement).complete) {
        onOneDone();
        return;
      }
      img.addEventListener('load', onOneDone, { once: true });
      img.addEventListener('error', onOneDone, { once: true });
    });

    // Safety timeout if image events never settle
    window.setTimeout(runPrint, 2000);
  });
}

export const QRCodeDialog: React.FC<QRCodeDialogProps> = ({
  isOpen,
  onClose,
  url,
  label,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [busyAction, setBusyAction] = useState<'share' | 'copy' | 'print' | null>(null);
  const plainLabel = useMemo(() => stripHtmlTags(label || ''), [label]);

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      setBusyAction(null);
      return;
    }

    dialogRef.current?.focus();

    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    // Capture on window so Escape isn't stolen by floating widgets that listen
    // in the capture phase before document bubble listeners run.
    window.addEventListener('keydown', handleEscKey, true);
    return () => {
      window.removeEventListener('keydown', handleEscKey, true);
    };
  }, [isOpen, onClose]);

  const getQrSvg = useCallback((): SVGSVGElement | null => {
    return qrRef.current?.querySelector('svg') ?? null;
  }, []);

  const handleCopy = useCallback(async () => {
    if (!url || busyAction) return;
    setBusyAction('copy');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      toast.success('Link copied to clipboard');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, toast, url]);

  const handleShare = useCallback(async () => {
    if (!url || busyAction) return;
    setBusyAction('share');
    try {
      const svg = getQrSvg();
      if (!svg) {
        toast.error('QR code is not ready to share');
        return;
      }

      const title = plainLabel || 'QR Code';
      const filename = safeQrFilename(plainLabel);
      const blob = await svgElementToPngBlob(svg, 512, {
        title,
        url,
      });
      const result = await deliverQrImage(blob, filename, title);

      if (result === 'shared') {
        toast.success('QR code shared');
      } else if (result === 'copied') {
        toast.success('QR image copied — paste it in your chat or app');
      } else {
        toast.info('QR image downloaded — attach it in your chat or app');
      }
    } catch (err) {
      // User dismissed the share sheet — not an error
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('QR share failed:', err);
      toast.error('Failed to share QR code');
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, getQrSvg, plainLabel, toast, url]);

  const handlePrint = useCallback(async () => {
    if (!url || busyAction) return;
    setBusyAction('print');
    try {
      const svg = getQrSvg();
      if (!svg) {
        toast.error('QR code is not ready to print');
        return;
      }

      const title = plainLabel || 'QR Code';
      await printHtmlDocument(
        buildPrintHtml({
          title,
          url,
          qrMarkup: serializeSvg(svg),
        })
      );
    } catch {
      toast.error('Failed to print QR code');
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, getQrSvg, plainLabel, toast, url]);

  if (!isOpen || typeof document === 'undefined') return null;

  const displayUrl = getDisplayUrl(url);
  const actionBtnClass =
    'inline-flex items-center justify-center w-10 h-10 rounded-lg transition-colors ' +
    'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-600 ' +
    'text-slate-700 dark:text-slate-200 disabled:opacity-50 disabled:pointer-events-none';

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm outline-none"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-code-dialog-title"
      tabIndex={-1}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-sm w-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 id="qr-code-dialog-title" className="text-lg font-bold text-slate-900 dark:text-white">
              QR Code
            </h3>
            <p
              className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 truncate"
              title={plainLabel}
              dangerouslySetInnerHTML={{ __html: label || '' }}
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
            title="Close"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 flex flex-col items-center gap-4">
          <div ref={qrRef} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
            <BrandedQRCode value={url} size={256} title={`QR code for ${plainLabel}`} className="" />
          </div>
          <p
            className="text-xs text-slate-500 dark:text-slate-400 font-mono text-center break-all max-w-full"
            title={url}
          >
            {displayUrl}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
            Scan with your phone camera to open this link
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={!!busyAction || !url}
              className={actionBtnClass}
              title="Share QR image"
              aria-label="Share QR image"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              disabled={!!busyAction || !url}
              className={actionBtnClass}
              title={copied ? 'Copied!' : 'Copy link'}
              aria-label={copied ? 'Copied' : 'Copy link'}
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-600" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={() => void handlePrint()}
              disabled={!!busyAction || !url}
              className={actionBtnClass}
              title="Print QR code"
              aria-label="Print QR code"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="w-5 h-5" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0H6.34m11.318 0h1.152c.95 0 1.745-.695 1.885-1.63l.583-4.083A1.876 1.876 0 0019.25 9.75H4.75a1.875 1.875 0 00-1.863 2.114l.583 4.083c.14.935.935 1.63 1.885 1.63H6.34" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9.75V6A2.25 2.25 0 0110.5 3.75h3A2.25 2.25 0 0115.75 6v3.75" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
