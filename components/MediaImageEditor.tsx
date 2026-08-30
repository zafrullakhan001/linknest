import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaCrop, FaExpand, FaImage, FaTimes } from 'react-icons/fa';
import type { MediaFile, MediaTransformOptions } from '../types';
import { formatMediaSize, transformMediaFile } from '../services/mediaService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';
import { MediaLightbox } from './MediaLightbox';

interface MediaImageEditorProps {
  file: MediaFile;
  onClose: () => void;
  onSaved: (file: MediaFile) => void;
}

function formatFromFile(file: MediaFile): 'png' | 'jpg' | 'webp' {
  const mime = (file.mime || '').toLowerCase();
  const name = (file.originalName || file.storedName || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpg';
  if (mime.includes('webp') || name.endsWith('.webp')) return 'webp';
  return 'png';
}

const PRESETS = [
  { label: 'Original', edge: 0 },
  { label: '2560', edge: 2560 },
  { label: '1920', edge: 1920 },
  { label: '1280', edge: 1280 },
  { label: '800', edge: 800 },
];

export const MediaImageEditor: React.FC<MediaImageEditorProps> = ({ file, onClose, onSaved }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(file.width || 0);
  const [naturalH, setNaturalH] = useState(file.height || 0);
  const [width, setWidth] = useState(file.width || 0);
  const [height, setHeight] = useState(file.height || 0);
  const [lockAspect, setLockAspect] = useState(true);
  const [quality, setQuality] = useState(formatFromFile(file) === 'png' ? 90 : 82);
  const [format, setFormat] = useState<'png' | 'jpg' | 'webp'>(formatFromFile(file));
  const [resizeMode, setResizeMode] = useState<'fit' | 'exact'>('fit');
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [removeBackground, setRemoveBackground] = useState(false);
  const [bgColor, setBgColor] = useState('');
  const [replace, setReplace] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimateBytes, setEstimateBytes] = useState<number | null>(null);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const aspect = useMemo(() => {
    if (!naturalW || !naturalH) return 1;
    return naturalW / naturalH;
  }, [naturalW, naturalH]);

  useEscapeToClose(true, onClose);

  const onWidthChange = (w: number) => {
    setWidth(w);
    if (lockAspect && aspect > 0) {
      setHeight(Math.max(1, Math.round(w / aspect)));
    }
  };

  const onHeightChange = (h: number) => {
    setHeight(h);
    if (lockAspect && aspect > 0) {
      setWidth(Math.max(1, Math.round(h * aspect)));
    }
  };

  const applyPreset = (edge: number) => {
    if (!naturalW || !naturalH) return;
    if (edge <= 0) {
      setWidth(naturalW);
      setHeight(naturalH);
      return;
    }
    const scale = Math.min(edge / naturalW, edge / naturalH, 1);
    setWidth(Math.max(1, Math.round(naturalW * scale)));
    setHeight(Math.max(1, Math.round(naturalH * scale)));
  };

  const toImageCoords = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img || !naturalW || !naturalH) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * naturalW;
    const y = ((clientY - rect.top) / rect.height) * naturalH;
    return {
      x: Math.max(0, Math.min(naturalW, Math.round(x))),
      y: Math.max(0, Math.min(naturalH, Math.round(y))),
    };
  };

  const applyRotate = (deg: 0 | 90 | 180 | 270) => {
    setRotate(deg);
    if (deg !== 0) {
      setCropMode(false);
      setCrop(null);
    }
    // #region agent log
    fetch('http://127.0.0.1:7808/ingest/ac6d79aa-db1a-4b9b-b803-66cfddabd40c', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'cee2c4' },
      body: JSON.stringify({
        sessionId: 'cee2c4',
        location: 'MediaImageEditor.tsx:applyRotate',
        message: 'preview rotate',
        data: { deg, naturalW, naturalH },
        timestamp: Date.now(),
        hypothesisId: 'F',
        runId: 'uplift-1',
      }),
    }).catch(() => {});
    // #endregion
  };

  const openOriginal = (force = false) => {
    if (cropMode && !force) return;
    // #region agent log
    fetch('http://127.0.0.1:7808/ingest/ac6d79aa-db1a-4b9b-b803-66cfddabd40c', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'cee2c4' },
      body: JSON.stringify({
        sessionId: 'cee2c4',
        location: 'MediaImageEditor.tsx:openOriginal',
        message: 'editor original lightbox',
        data: { id: file.id, rotate, width: file.width, height: file.height, usingOriginalUrl: !!file.url },
        timestamp: Date.now(),
        hypothesisId: 'C',
        runId: 'uplift-1',
      }),
    }).catch(() => {});
    // #endregion
    setShowOriginal(true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!cropMode) return;
    const p = toImageCoords(e.clientX, e.clientY);
    setDragStart(p);
    setCrop({ x: p.x, y: p.y, w: 1, h: 1 });
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!cropMode || !dragStart) return;
    const p = toImageCoords(e.clientX, e.clientY);
    const x = Math.min(dragStart.x, p.x);
    const y = Math.min(dragStart.y, p.y);
    const w = Math.max(1, Math.abs(p.x - dragStart.x));
    const h = Math.max(1, Math.abs(p.y - dragStart.y));
    setCrop({ x, y, w, h });
  };

  const onPointerUp = () => setDragStart(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete || !width || !height) {
      setEstimateBytes(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setEstimateBusy(true);
      try {
        const canvas = document.createElement('canvas');
        const cw = Math.max(1, Math.min(width, 4096));
        const ch = Math.max(1, Math.min(height, 4096));
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (format === 'jpg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
        }
        ctx.drawImage(img, 0, 0, cw, ch);
        const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, mime, format === 'png' ? undefined : quality / 100);
        });
        if (!cancelled) setEstimateBytes(blob?.size ?? null);
      } catch {
        if (!cancelled) setEstimateBytes(null);
      } finally {
        if (!cancelled) setEstimateBusy(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [width, height, quality, format, file.url]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const dimsChanged = width > 0 && height > 0 && (width !== naturalW || height !== naturalH);
      const opts: MediaTransformOptions = {
        quality,
        format,
        resizeMode,
        removeBackground,
        bgColor: bgColor || undefined,
        replace,
      };
      if (dimsChanged) {
        opts.width = width;
        opts.height = height;
      }
      if (rotate) {
        opts.rotate = rotate;
      }
      if (crop && crop.w > 1 && crop.h > 1) {
        opts.crop = crop;
      }
      // #region agent log
      fetch('http://127.0.0.1:7808/ingest/ac6d79aa-db1a-4b9b-b803-66cfddabd40c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'cee2c4' },
        body: JSON.stringify({
          sessionId: 'cee2c4',
          location: 'MediaImageEditor.tsx:handleSave',
          message: 'transform options',
          data: {
            ...opts,
            naturalW,
            naturalH,
            dimsChanged,
            originalFormat: formatFromFile(file),
            originalBytes: file.sizeBytes,
          },
          timestamp: Date.now(),
          hypothesisId: 'D',
          runId: 'uplift-1',
        }),
      }).catch(() => {});
      // #endregion
      const saved = await transformMediaFile(file.id, opts);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transform failed');
    } finally {
      setSaving(false);
    }
  };

  if (!file.url) {
    return null;
  }

  const displayCrop =
    crop && naturalW
      ? {
          left: `${(crop.x / naturalW) * 100}%`,
          top: `${(crop.y / naturalH) * 100}%`,
          width: `${(crop.w / naturalW) * 100}%`,
          height: `${(crop.h / naturalH) * 100}%`,
        }
      : null;

  const quarterTurn = rotate === 90 || rotate === 270;
  const previewScale =
    naturalW > 0 && naturalH > 0 ? Math.min(360 / naturalW, 360 / naturalH, 1) : 1;
  const previewImgW = Math.max(1, Math.round((naturalW || 360) * previewScale));
  const previewImgH = Math.max(1, Math.round((naturalH || 360) * previewScale));
  const previewBoxW = quarterTurn ? previewImgH : previewImgW;
  const previewBoxH = quarterTurn ? previewImgW : previewImgH;

  const field =
    'mt-1 w-full rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1a1a1a] px-2.5 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30';
  const seg = 'inline-flex flex-wrap rounded-xl bg-slate-100 dark:bg-[#252525] p-0.5';
  const segBtn = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all';
  const ghostBtn =
    'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333] transition-all';

  return (
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div
        className="max-w-4xl w-full max-h-[90vh] overflow-auto rounded-3xl border border-slate-200 dark:border-[#333] bg-gradient-to-b from-slate-50 to-white dark:from-[#151a22] dark:to-[#111] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/80 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 shrink-0">
              <FaImage size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight truncate">
                Edit image
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{file.title || file.originalName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-[#333] transition-colors"
            title="Close"
          >
            <FaTimes size={16} />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-5">
          <div className="flex flex-col gap-2">
            <div className="bg-slate-100 dark:bg-[#111] rounded-2xl overflow-hidden min-h-[220px] flex items-center justify-center p-3 border border-slate-200 dark:border-[#333]">
              <div
                className="relative"
                style={{
                  width: previewBoxW,
                  height: previewBoxH,
                  transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), height 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div
                  className="absolute left-1/2 top-1/2"
                  style={{
                    width: previewImgW,
                    height: previewImgH,
                    transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
                    transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <img
                    ref={imgRef}
                    src={file.url}
                    alt={file.altText || file.originalName}
                    className={`w-full h-full object-contain ${cropMode ? 'cursor-crosshair' : 'cursor-zoom-in'}`}
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      setNaturalW(el.naturalWidth);
                      setNaturalH(el.naturalHeight);
                      setWidth((w) => w || el.naturalWidth);
                      setHeight((h) => h || el.naturalHeight);
                    }}
                    onClick={() => openOriginal()}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    draggable={false}
                    crossOrigin="anonymous"
                  />
                  {displayCrop && (
                    <div
                      className="absolute border-2 border-sky-400 bg-sky-400/20 pointer-events-none"
                      style={displayCrop}
                    />
                  )}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 text-center">
              {cropMode ? 'Drag on the image to crop' : 'Click the image to view original size'}
              {rotate ? ` · Preview rotated ${rotate}°` : ''}
            </p>
            <button type="button" onClick={() => openOriginal(true)} className={ghostBtn}>
              <FaExpand size={10} /> View original size
            </button>
          </div>

          <div className="space-y-3 text-sm">
            <p className="text-xs text-slate-500">
              Original: {naturalW || '—'}×{naturalH || '—'} · {formatMediaSize(file.sizeBytes)}
            </p>

            <div className={seg}>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.edge)}
                  className={`${segBtn} text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-white dark:hover:bg-[#333]`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 items-end">
              <label className="flex-1 font-semibold text-slate-600 dark:text-slate-300">
                Width
                <input
                  type="number"
                  min={1}
                  value={width || ''}
                  onChange={(e) => onWidthChange(parseInt(e.target.value, 10) || 0)}
                  className={field}
                />
              </label>
              <label className="flex-1 font-semibold text-slate-600 dark:text-slate-300">
                Height
                <input
                  type="number"
                  min={1}
                  value={height || ''}
                  onChange={(e) => onHeightChange(parseInt(e.target.value, 10) || 0)}
                  className={field}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} className="accent-cyan-500" />
              <span>Lock aspect ratio</span>
            </label>

            <label className="block font-semibold text-slate-600 dark:text-slate-300">
              Resize mode
              <select
                value={resizeMode}
                onChange={(e) => setResizeMode(e.target.value as 'fit' | 'exact')}
                className={field}
              >
                <option value="fit">Fit inside (keep proportions)</option>
                <option value="exact">Exact width × height (may stretch)</option>
              </select>
            </label>

            <label className="block font-semibold text-slate-600 dark:text-slate-300">
              Quality ({quality}){format === 'png' ? ' — PNG compression' : ''}
              <input
                type="range"
                min={40}
                max={100}
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                className="w-full mt-2 accent-cyan-500"
              />
            </label>

            <label className="block font-semibold text-slate-600 dark:text-slate-300">
              Format
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'png' | 'jpg' | 'webp')}
                className={field}
              >
                <option value="jpg">JPEG — best for photos</option>
                <option value="webp">WebP — small, keeps transparency</option>
                <option value="png">PNG — lossless (larger)</option>
              </select>
            </label>

            <p className="text-xs text-slate-500">
              {estimateBusy
                ? 'Estimating size…'
                : estimateBytes != null
                  ? `Estimated new size ≈ ${formatMediaSize(estimateBytes)} (was ${formatMediaSize(file.sizeBytes)})`
                  : 'Size estimate appears after the image loads'}
            </p>

            <label className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={cropMode} onChange={(e) => setCropMode(e.target.checked)} className="accent-cyan-500" />
              <FaCrop size={11} className="text-cyan-500" />
              <span>Crop mode (drag on image)</span>
            </label>
            {crop && (
              <p className="text-xs text-slate-500">
                Crop: {crop.x},{crop.y} — {crop.w}×{crop.h}
                <button type="button" className="ml-2 font-bold text-cyan-600 dark:text-cyan-400" onClick={() => setCrop(null)}>
                  Clear
                </button>
              </p>
            )}

            <div>
              <span className="font-semibold text-slate-600 dark:text-slate-300">Rotate</span>
              <div className={`${seg} mt-1`}>
                {([0, 90, 180, 270] as const).map((deg) => (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => applyRotate(deg)}
                    className={`${segBtn} ${
                      rotate === deg
                        ? 'bg-white dark:bg-[#333] text-cyan-600 dark:text-cyan-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {deg === 0 ? 'None' : `${deg}°`}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} className="accent-cyan-500" />
              <span>Remove background color</span>
            </label>
            {removeBackground && (
              <label className="block font-semibold text-slate-600 dark:text-slate-300">
                BG color (optional hex)
                <input
                  type="text"
                  placeholder="#ffffff (or leave empty for auto)"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className={field}
                />
              </label>
            )}

            <label className="flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-cyan-500" />
              <span>Replace original (breaks existing embeds)</span>
            </label>
            <p className="text-xs text-slate-500">Default saves as a new file so existing rich-text embeds keep working.</p>

            {error && (
              <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white py-2.5 font-bold shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
              >
                {saving ? 'Saving…' : replace ? 'Replace' : 'Save as new'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-2xl text-sm font-bold bg-slate-100 dark:bg-[#252525] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333] transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
      {showOriginal && file.url && (
        <MediaLightbox file={file} rotate={rotate} onClose={() => setShowOriginal(false)} />
      )}
    </div>
  );
};
