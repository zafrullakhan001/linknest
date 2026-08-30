import React, { useState } from 'react';
import type { MediaTransformOptions } from '../types';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface MediaCompressDialogProps {
  count: number;
  onClose: () => void;
  onConfirm: (opts: MediaTransformOptions, label: string) => void;
}

export const MediaCompressDialog: React.FC<MediaCompressDialogProps> = ({ count, onClose, onConfirm }) => {
  const [maxEdge, setMaxEdge] = useState(1920);
  const [quality, setQuality] = useState(78);
  const [format, setFormat] = useState<'jpg' | 'webp' | 'keep'>('jpg');
  useEscapeToClose(true, onClose);

  const handleConfirm = () => {
    const opts: MediaTransformOptions = {
      quality,
      replace: true,
      resizeMode: 'fit',
    };
    if (maxEdge > 0) {
      opts.width = maxEdge;
      opts.height = maxEdge;
    }
    if (format !== 'keep') {
      opts.format = format;
    }
    const edgeLabel = maxEdge > 0 ? `max ${maxEdge}px` : 'original size';
    const fmtLabel = format === 'keep' ? 'same format' : format.toUpperCase();
    onConfirm(opts, `Compress (${edgeLabel}, q${quality}, ${fmtLabel})`);
  };

  return (
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="font-semibold text-slate-900 dark:text-white">Compress {count} image{count === 1 ? '' : 's'}</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-white text-xl leading-none px-2">
            ×
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-slate-600 dark:text-slate-300">Max long edge</span>
            <select
              value={maxEdge}
              onChange={(e) => setMaxEdge(parseInt(e.target.value, 10))}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5"
            >
              <option value={2560}>2560px (large)</option>
              <option value={1920}>1920px (recommended)</option>
              <option value={1280}>1280px</option>
              <option value={800}>800px</option>
              <option value={0}>Keep original dimensions</option>
            </select>
          </label>
          <label className="block">
            <span className="text-slate-600 dark:text-slate-300">Quality ({quality})</span>
            <input
              type="range"
              min={40}
              max={95}
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              className="w-full"
            />
            <p className="text-[11px] text-slate-500">Lower = smaller file. 72–82 is a good balance.</p>
          </label>
          <label className="block">
            <span className="text-slate-600 dark:text-slate-300">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'jpg' | 'webp' | 'keep')}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5"
            >
              <option value="jpg">JPEG (smallest, no transparency)</option>
              <option value="webp">WebP (small, keeps transparency)</option>
              <option value="keep">Keep original format</option>
            </select>
          </label>
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            This replaces the selected files in place. Existing embeds keep the same URL.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg py-2 font-semibold"
            >
              Compress
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
  );
};
