import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type PlayerPos = { left: number; top: number };

/** Keep at least this much of the title bar reachable on-screen. */
const EDGE_GRIP = 56;

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
  const posRef = useRef<PlayerPos | null>(null);
  const dragGrabRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const [maximized, setMaximized] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [position, setPosition] = useState<PlayerPos | null>(null);
  const [isDragging, setIsDragging] = useState(false);

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

  const clampPosition = useCallback((left: number, top: number, size?: { w: number; h: number }): PlayerPos => {
    const el = shellRef.current;
    const w = size?.w || el?.offsetWidth || Math.min(896, window.innerWidth - 24);
    const h = size?.h || el?.offsetHeight || Math.round(w * 9 / 16) + 120;
    return {
      left: Math.min(window.innerWidth - EDGE_GRIP, Math.max(EDGE_GRIP - w, left)),
      top: Math.min(window.innerHeight - EDGE_GRIP, Math.max(0, top)),
    };
  }, []);

  const centerPlayer = useCallback(() => {
    const el = shellRef.current;
    if (!el) return false;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w < 32 || h < 32) return false;
    const next = clampPosition(
      Math.round((window.innerWidth - w) / 2),
      Math.round((window.innerHeight - h) / 2),
      { w, h }
    );
    posRef.current = next;
    setPosition(next);
    return true;
  }, [clampPosition]);

  useEffect(() => {
    if (!isOpen) {
      setMaximized(false);
      setAutoplay(true);
      setPosition(null);
      posRef.current = null;
      setIsDragging(false);
      dragGrabRef.current = null;
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

  // Always center when the dialog is launched (and again after restore from maximize).
  useEffect(() => {
    if (!isOpen || maximized) return;

    let cancelled = false;
    let tries = 0;

    const tryCenter = () => {
      if (cancelled || dragGrabRef.current) return;
      if (centerPlayer()) return;
      if (tries++ < 12) {
        window.requestAnimationFrame(tryCenter);
      } else {
        // Fallback using estimated size so it still lands in the middle
        const w = Math.min(896, window.innerWidth - 24);
        const h = Math.round((w * 9) / 16) + 120;
        const next = clampPosition(
          Math.round((window.innerWidth - w) / 2),
          Math.round((window.innerHeight - h) / 2),
          { w, h }
        );
        posRef.current = next;
        setPosition(next);
      }
    };

    // Reset so a previous drag position is not reused on a new open / restore
    posRef.current = null;
    setPosition(null);
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(tryCenter);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [isOpen, maximized, centerPlayer, clampPosition]);

  useEffect(() => {
    if (!isOpen || isYouTube) return;
    const el = videoRef.current;
    if (!el) return;
    if (autoplay) {
      void el.play().catch(() => undefined);
    }
  }, [isOpen, isYouTube, autoplay, videoUrl]);

  const applyDragPosition = useCallback(
    (clientX: number, clientY: number) => {
      const grab = dragGrabRef.current;
      if (!grab) return;
      const next = clampPosition(clientX - grab.offsetX, clientY - grab.offsetY);
      posRef.current = next;
      setPosition(next);
    },
    [clampPosition]
  );

  const onTitlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (maximized) return;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('a, button, input, label, select, textarea')) return;

    const el = shellRef.current;
    if (!el) return;

    // Grab offset from the live on-screen box so the title bar stays under the cursor
    const rect = el.getBoundingClientRect();
    dragGrabRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };

    e.preventDefault();
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    applyDragPosition(e.clientX, e.clientY);
  };

  const onTitlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragGrabRef.current) return;
    applyDragPosition(e.clientX, e.clientY);
  };

  const endTitleDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragGrabRef.current) return;
    dragGrabRef.current = null;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

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

  const shellStyle: React.CSSProperties = maximized
    ? {
        position: 'fixed',
        left: 0,
        top: 0,
        width: '100vw',
        height: '100vh',
        maxWidth: 'none',
        maxHeight: 'none',
      }
      : position
      ? {
          position: 'fixed',
          left: position.left,
          top: position.top,
          width: 'min(56rem, calc(100vw - 1.5rem))',
          maxWidth: 'calc(100vw - 1.5rem)',
          maxHeight: 'min(90vh, 820px)',
          transition: isDragging ? 'none' : undefined,
          willChange: isDragging ? 'left, top' : undefined,
        }
      : {
          // Visible and centered via transform until measured left/top is ready
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(56rem, calc(100vw - 1.5rem))',
          maxWidth: 'calc(100vw - 1.5rem)',
          maxHeight: 'min(90vh, 820px)',
        };

  return createPortal(
    <div className="fixed inset-0 z-[99999]" role="presentation">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={shellRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-space-player-title"
        style={shellStyle}
        className={`pointer-events-auto flex flex-col overflow-hidden border border-slate-700/80 bg-slate-950 text-white shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
          maximized ? 'rounded-none' : 'rounded-2xl'
        }`}
      >
        <div
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={endTitleDrag}
          onPointerCancel={endTitleDrag}
          className={`shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-slate-900/90 select-none ${
            maximized ? '' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          title={maximized ? undefined : 'Drag to move anywhere on screen'}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0" aria-hidden>{emoji || '🎬'}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-300">Video space</p>
              <h2 id="video-space-player-title" className="text-sm font-semibold truncate" title={title}>
                {title || 'Video'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 cursor-default">
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
              Drag the title bar to move anywhere on screen
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
