import React, { useEffect, useRef, useState } from 'react';
import { toYouTubeEmbedUrl, toYouTubeThumbnailUrl } from '../utils/youtube';

const PREVIEW_DELAY_MS = 5000;
const PREVIEW_DURATION_SEC = 15;
const PREVIEW_DURATION_MS = PREVIEW_DURATION_SEC * 1000;

/** Shared clock so every tile waits from the same page-load moment. */
const PAGE_LOAD_AT =
  typeof performance !== 'undefined' ? performance.now() : Date.now();

function msUntilPreviewStart(): number {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return Math.max(0, PREVIEW_DELAY_MS - (now - PAGE_LOAD_AT));
}

interface VideoTileInlinePreviewProps {
  videoUrl: string;
  isYouTube: boolean;
  /** Fill the parent tile (no extra height from aspect-video). */
  fill?: boolean;
}

/**
 * Shows thumbnail, then after 5s from page load plays a muted 15s clip on the tile.
 * Only starts when the tile is (or becomes) visible in the viewport.
 */
export const VideoTileInlinePreview: React.FC<VideoTileInlinePreviewProps> = ({
  videoUrl,
  isYouTube,
  fill = false,
}) => {
  const shellRef = useRef<HTMLDivElement>(null);
  const fileVideoRef = useRef<HTMLVideoElement>(null);
  const [inView, setInView] = useState(false);
  const [previewPhase, setPreviewPhase] = useState<'idle' | 'playing' | 'done'>('idle');

  const thumbUrl = isYouTube ? toYouTubeThumbnailUrl(videoUrl) : null;
  const embedUrl =
    isYouTube && previewPhase === 'playing'
      ? toYouTubeEmbedUrl(videoUrl, {
          autoplay: true,
          mute: true,
          controls: false,
          start: 0,
          end: PREVIEW_DURATION_SEC,
        })
      : null;

  useEffect(() => {
    const el = shellRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setInView(!!entry?.isIntersecting),
      { root: null, rootMargin: '80px', threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || previewPhase !== 'idle') return;

    const startTimer = setTimeout(() => {
      setPreviewPhase('playing');
    }, msUntilPreviewStart());

    return () => clearTimeout(startTimer);
  }, [inView, previewPhase]);

  useEffect(() => {
    if (previewPhase !== 'playing') return;
    const stopTimer = setTimeout(() => setPreviewPhase('done'), PREVIEW_DURATION_MS);
    return () => clearTimeout(stopTimer);
  }, [previewPhase]);

  useEffect(() => {
    if (isYouTube || previewPhase !== 'playing') return;
    const video = fileVideoRef.current;
    if (!video) return;

    video.currentTime = 0;
    video.muted = true;
    void video.play().catch(() => undefined);

    const onTimeUpdate = () => {
      if (video.currentTime >= PREVIEW_DURATION_SEC) {
        video.pause();
        video.currentTime = 0;
        setPreviewPhase('done');
      }
    };
    const onEnded = () => setPreviewPhase('done');

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('ended', onEnded);
      video.pause();
    };
  }, [isYouTube, previewPhase, videoUrl]);

  const showPlaying = previewPhase === 'playing';

  return (
    <div
      ref={shellRef}
      className={
        fill
          ? 'absolute inset-0 z-[1] w-auto h-auto rounded-[inherit] overflow-hidden bg-slate-900'
          : 'relative z-[1] w-full aspect-video rounded-lg overflow-hidden mb-3 bg-slate-900 shrink-0 shadow-sm ring-1 ring-black/5 dark:ring-white/10'
      }
    >
      {thumbUrl && (
        <img
          src={thumbUrl}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none select-none transition-opacity duration-300 ${showPlaying ? 'opacity-0' : 'opacity-100'}`}
          loading="lazy"
          draggable={false}
        />
      )}

      {!isYouTube && (
        <video
          ref={fileVideoRef}
          src={videoUrl}
          muted
          playsInline
          preload={showPlaying ? 'auto' : 'metadata'}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none ${showPlaying ? 'opacity-100' : 'opacity-90'}`}
        />
      )}

      {isYouTube && embedUrl && (
        <iframe
          key={embedUrl}
          src={embedUrl}
          title="Video preview"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="absolute inset-0 w-full h-full border-0 pointer-events-none"
          tabIndex={-1}
        />
      )}

      {!showPlaying && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent pointer-events-none group-hover:opacity-0 transition-opacity duration-200" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none group-hover:opacity-0 transition-opacity duration-200">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-600/95 text-white shadow-lg shadow-black/40 ring-2 ring-white/30"
              aria-hidden
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            </span>
          </div>
        </>
      )}

      {isYouTube && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white pointer-events-none group-hover:opacity-0 transition-opacity">
          {showPlaying ? 'Preview' : 'YouTube'}
        </span>
      )}
      {!isYouTube && showPlaying && (
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white pointer-events-none group-hover:opacity-0 transition-opacity">
          Preview
        </span>
      )}
    </div>
  );
};
