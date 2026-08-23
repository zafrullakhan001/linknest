import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  isYouTubeUrl,
  toYouTubeEmbedUrl,
  toYouTubeWatchUrl,
} from '../utils/youtube';

export type VideoSpaceSource = 'youtube' | 'file';

interface VideoSpacePlayerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  videoUrl: string;
  videoSource?: VideoSpaceSource | null;
  emoji?: string;
}

export const VideoSpacePlayerDialog: React.FC<VideoSpacePlayerDialogProps> = ({
  isOpen,
  onClose,
  title,
  videoUrl,
  videoSource,
  emoji,
}) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [maximized, setMaximized] = useState(false);
  const [autoplay, setAutoplay] = useState(true);

  const isYouTube = useMemo(() => {
    if (videoSource === 'youtube') return true;
    if (videoSource === 'file') return false;
    return isYouTubeUrl(videoUrl);
  }, [videoSource, videoUrl]);

  const embedUrl = useMemo(
    () => (isYouTube ? toYouTubeEmbedUrl(videoUrl, { autoplay }) : null),
    [isYouTube, videoUrl, autoplay]
  );
  const watchUrl = useMemo(
    () => (isYouTube ? toYouTubeWatchUrl(videoUrl) : null),
    [isYouTube, videoUrl]
  );

  useEffect(() => {
    if (!isOpen) {
      setMaximized(false);
      setAutoplay(true);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        if (maximized) {
          setMaximized(false);
          return;
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, maximized, onClose]);

  useEffect(() => {
    if (!isOpen || isYouTube) return;
    const el = videoRef.current;
    if (!el) return;
    if (autoplay) {
      void el.play().catch(() => undefined);
    }
  }, [isOpen, isYouTube, autoplay, videoUrl]);

  const enterBrowserFullscreen = async () => {
    const target = shellRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch {
      setMaximized(true);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const frameClass = maximized
    ? 'w-full h-full max-w-none max-h-none rounded-none'
    : 'w-full max-w-4xl max-h-[min(90vh,820px)] rounded-2xl';

  return createPortal(
    <div className="fixed inset-0 z-[99999]" role="presentation">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className={`absolute inset-0 flex items-center justify-center ${maximized ? 'p-0' : 'p-4'} pointer-events-none`}>
        <div
          ref={shellRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="video-space-player-title"
          className={`pointer-events-auto flex flex-col overflow-hidden border border-slate-700/80 bg-slate-950 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${frameClass}`}
        >
          <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/90">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xl shrink-0" aria-hidden>{emoji || '🎬'}</span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">Video space</p>
                <h2 id="video-space-player-title" className="text-sm font-semibold truncate" title={title}>
                  {title || 'Video'}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isYouTube && watchUrl && (
                <a
                  href={watchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                  title="Open on YouTube"
                >
                  YouTube
                </a>
              )}
              <button
                type="button"
                onClick={() => setMaximized((v) => !v)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
                title={maximized ? 'Exit maximize' : 'Maximize in app'}
              >
                {maximized ? 'Restore' : 'Maximize'}
              </button>
              <button
                type="button"
                onClick={() => void enterBrowserFullscreen()}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white transition-colors"
                title="Browser fullscreen"
              >
                Fullscreen
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                title="Close"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className={`relative bg-black ${maximized ? 'flex-1 min-h-0' : 'aspect-video w-full'}`}>
            {isYouTube && embedUrl ? (
              <iframe
                key={embedUrl}
                src={embedUrl}
                title={title || 'YouTube video'}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="absolute inset-0 w-full h-full border-0"
              />
            ) : videoUrl ? (
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                playsInline
                autoPlay={autoplay}
                className="absolute inset-0 w-full h-full"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                No video available
              </div>
            )}
          </div>

          {!maximized && (
            <div className="shrink-0 px-4 py-2.5 border-t border-white/10 bg-slate-900/80 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoplay}
                  onChange={(e) => setAutoplay(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Autoplay when opened
              </label>
              <p className="text-[11px] text-slate-500">
                {isYouTube
                  ? 'Play here, maximize in LinkNest, or open on YouTube'
                  : 'Play in LinkNest — use Maximize or Fullscreen for a larger view'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
