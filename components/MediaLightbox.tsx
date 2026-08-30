import React, { useEffect, useMemo, useState } from 'react';
import type { MediaFile } from '../types';
import { formatMediaSize } from '../services/mediaService';
import { useEscapeToClose } from '../hooks/useEscapeToClose';

interface MediaLightboxProps {
  file: MediaFile;
  files?: MediaFile[];
  onClose: () => void;
  onChange?: (file: MediaFile) => void;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({ file, files, onClose, onChange }) => {
  const [actualSize, setActualSize] = useState(false);
  const images = useMemo(
    () => (files || []).filter((f) => f.kind === 'image' && f.url && f.status !== 'trash'),
    [files]
  );
  const index = images.findIndex((f) => f.id === file.id);
  const current = images[index] || file;
  const url = current.url || '';

  useEscapeToClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && index >= 0 && index < images.length - 1) {
        e.preventDefault();
        onChange?.(images[index + 1]);
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        onChange?.(images[index - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images, onChange]);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7808/ingest/ac6d79aa-db1a-4b9b-b803-66cfddabd40c', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'cee2c4' },
      body: JSON.stringify({
        sessionId: 'cee2c4',
        location: 'MediaLightbox.tsx:open',
        message: 'lightbox opened',
        data: {
          id: current.id,
          usingOriginalUrl: !!current.url && current.url !== current.thumbUrl,
          urlIsThumb: !!(current.thumbUrl && url === current.thumbUrl),
          width: current.width,
          height: current.height,
          sizeBytes: current.sizeBytes,
        },
        timestamp: Date.now(),
        hypothesisId: 'C',
        runId: 'uplift-1',
      }),
    }).catch(() => {});
    // #endregion
  }, [current.id, current.url, current.thumbUrl, current.width, current.height, current.sizeBytes, url]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[2147483647] flex flex-col bg-black/85"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Full-size image"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-white/90 text-xs shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 truncate">
          <span className="font-semibold">{current.title || current.originalName}</span>
          <span className="ml-2 text-white/60">
            {current.width && current.height ? `${current.width}×${current.height}` : ''}
            {current.sizeBytes ? ` · ${formatMediaSize(current.sizeBytes)}` : ''}
            {index >= 0 ? ` · ${index + 1}/${images.length}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {index > 0 && (
            <button
              type="button"
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              onClick={() => onChange?.(images[index - 1])}
            >
              ←
            </button>
          )}
          {index >= 0 && index < images.length - 1 && (
            <button
              type="button"
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              onClick={() => onChange?.(images[index + 1])}
            >
              →
            </button>
          )}
          <button
            type="button"
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
            onClick={() => setActualSize((v) => !v)}
          >
            {actualSize ? 'Fit to screen' : 'Actual size'}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded bg-white/10 hover:bg-white/20"
          >
            Open
          </a>
          <a href={url} download={current.originalName} className="px-2 py-1 rounded bg-white/10 hover:bg-white/20">
            Download
          </a>
          <button type="button" className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-lg leading-none" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3" onClick={onClose}>
        <img
          src={url}
          alt={current.altText || current.originalName}
          onClick={(e) => {
            e.stopPropagation();
            setActualSize((v) => !v);
          }}
          className={
            actualSize
              ? 'max-w-none cursor-zoom-out'
              : 'max-w-full max-h-full object-contain cursor-zoom-in'
          }
        />
      </div>
    </div>
  );
};
