import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaFile, MediaTransformOptions } from '../types';
import { transformMediaFile } from '../services/mediaService';

interface MediaImageEditorProps {
  file: MediaFile;
  onClose: () => void;
  onSaved: (file: MediaFile) => void;
}

export const MediaImageEditor: React.FC<MediaImageEditorProps> = ({ file, onClose, onSaved }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalW, setNaturalW] = useState(file.width || 0);
  const [naturalH, setNaturalH] = useState(file.height || 0);
  const [width, setWidth] = useState(file.width || 0);
  const [height, setHeight] = useState(file.height || 0);
  const [lockAspect, setLockAspect] = useState(true);
  const [quality, setQuality] = useState(85);
  const [format, setFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [removeBackground, setRemoveBackground] = useState(false);
  const [bgColor, setBgColor] = useState('');
  const [replace, setReplace] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aspect = useMemo(() => {
    if (!naturalW || !naturalH) return 1;
    return naturalW / naturalH;
  }, [naturalW, naturalH]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const opts: MediaTransformOptions = {
        width: width || undefined,
        height: height || undefined,
        quality,
        format,
        removeBackground,
        bgColor: bgColor || undefined,
        replace,
      };
      if (crop && crop.w > 1 && crop.h > 1) {
        opts.crop = crop;
      }
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

  const img = imgRef.current;
  const displayCrop =
    crop && img && naturalW
      ? {
          left: `${(crop.x / naturalW) * 100}%`,
          top: `${(crop.y / naturalH) * 100}%`,
          width: `${(crop.w / naturalW) * 100}%`,
          height: `${(crop.h / naturalH) * 100}%`,
        }
      : null;

  return (
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-auto border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">Edit image — {file.title || file.originalName}</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-white text-xl leading-none px-2">
            ×
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-4">
          <div className="relative bg-slate-100 dark:bg-slate-900 rounded-lg overflow-hidden min-h-[200px] flex items-center justify-center">
            <img
              ref={imgRef}
              src={file.url}
              alt={file.altText || file.originalName}
              className={`max-w-full max-h-[360px] object-contain ${cropMode ? 'cursor-crosshair' : ''}`}
              onLoad={(e) => {
                const el = e.currentTarget;
                setNaturalW(el.naturalWidth);
                setNaturalH(el.naturalHeight);
                if (!width) setWidth(el.naturalWidth);
                if (!height) setHeight(el.naturalHeight);
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              draggable={false}
            />
            {displayCrop && (
              <div
                className="absolute border-2 border-sky-400 bg-sky-400/20 pointer-events-none"
                style={displayCrop}
              />
            )}
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex gap-2 items-end">
              <label className="flex-1">
                <span className="text-slate-600 dark:text-slate-300">Width</span>
                <input
                  type="number"
                  min={1}
                  value={width || ''}
                  onChange={(e) => onWidthChange(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5"
                />
              </label>
              <label className="flex-1">
                <span className="text-slate-600 dark:text-slate-300">Height</span>
                <input
                  type="number"
                  min={1}
                  value={height || ''}
                  onChange={(e) => onHeightChange(parseInt(e.target.value, 10) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5"
                />
              </label>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
              <span>Lock aspect ratio</span>
            </label>

            <label className="block">
              <span className="text-slate-600 dark:text-slate-300">Quality ({quality})</span>
              <input
                type="range"
                min={40}
                max={100}
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </label>

            <label className="block">
              <span className="text-slate-600 dark:text-slate-300">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'png' | 'jpg' | 'webp')}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5"
              >
                <option value="png">PNG</option>
                <option value="jpg">JPEG</option>
                <option value="webp">WebP</option>
              </select>
            </label>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={cropMode} onChange={(e) => setCropMode(e.target.checked)} />
              <span>Crop mode (drag on image)</span>
            </label>
            {crop && (
              <p className="text-xs text-slate-500">
                Crop: {crop.x},{crop.y} — {crop.w}×{crop.h}
                <button type="button" className="ml-2 text-sky-600" onClick={() => setCrop(null)}>
                  Clear
                </button>
              </p>
            )}

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} />
              <span>Remove background color</span>
            </label>
            {removeBackground && (
              <label className="block">
                <span className="text-slate-600 dark:text-slate-300">BG color (optional hex)</span>
                <input
                  type="text"
                  placeholder="#ffffff (or leave empty for auto)"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5"
                />
              </label>
            )}

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
              <span>Replace original (breaks existing embeds)</span>
            </label>
            <p className="text-xs text-slate-500">Default saves as a new file so existing rich-text embeds keep working.</p>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg py-2 font-semibold"
              >
                {saving ? 'Saving…' : replace ? 'Replace' : 'Save as new'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
