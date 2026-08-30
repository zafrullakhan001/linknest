import React, { useState } from 'react';
import { FaCompress, FaTimes } from 'react-icons/fa';
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

  const field =
    'mt-1 w-full rounded-xl border border-slate-200 dark:border-[#333] bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30';

  return (
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-slate-950/60 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-[#333] bg-gradient-to-b from-slate-50 to-white dark:from-[#151a22] dark:to-[#111] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-200 dark:border-[#333] bg-white/70 dark:bg-[#1a1a1a]/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 shrink-0">
              <FaCompress size={16} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                Compress {count} image{count === 1 ? '' : 's'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Choose size, quality, and format.</p>
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
        <div className="p-5 space-y-3.5 text-sm">
          <label className="block font-semibold text-slate-600 dark:text-slate-300">
            Max long edge
            <select
              value={maxEdge}
              onChange={(e) => setMaxEdge(parseInt(e.target.value, 10))}
              className={field}
            >
              <option value={2560}>2560px (large)</option>
              <option value={1920}>1920px (recommended)</option>
              <option value={1280}>1280px</option>
              <option value={800}>800px</option>
              <option value={0}>Keep original dimensions</option>
            </select>
          </label>
          <label className="block font-semibold text-slate-600 dark:text-slate-300">
            Quality ({quality})
            <input
              type="range"
              min={40}
              max={95}
              value={quality}
              onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              className="w-full mt-2 accent-cyan-500"
            />
            <p className="text-[11px] font-medium text-slate-500 mt-1">Lower = smaller file. 72–82 is a good balance.</p>
          </label>
          <label className="block font-semibold text-slate-600 dark:text-slate-300">
            Format
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'jpg' | 'webp' | 'keep')}
              className={field}
            >
              <option value="jpg">JPEG (smallest, no transparency)</option>
              <option value="webp">WebP (small, keeps transparency)</option>
              <option value="keep">Keep original format</option>
            </select>
          </label>
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
            This replaces the selected files in place. Existing embeds keep the same URL.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white py-2.5 font-bold shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
            >
              <FaCompress size={12} /> Compress
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
  );
};
