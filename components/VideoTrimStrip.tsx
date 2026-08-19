import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_TRIM_SECONDS } from '../utils/trimVideoBlob';

const FRAME_COUNT = 16;
const HANDLE_HIT_PX = 18;

export interface VideoTrimStripProps {
  src: string;
  busy?: boolean;
  busyLabel?: string;
  source: 'webcam' | 'file';
  onConfirm: (startSec: number, endSec: number) => void;
  onDiscard: () => void;
  onRerecord?: () => void;
  onChooseAnotherFile?: () => void;
}

function formatClipTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function sampleFilmstrip(src: string, count: number, signal: AbortSignal): Promise<string[]> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not read video frames.'));
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    video.load();
  });

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    video.removeAttribute('src');
    video.load();
    return [];
  }

  const canvas = document.createElement('canvas');
  const width = 96;
  const height = Math.max(54, Math.round(width * ((video.videoHeight || 9) / (video.videoWidth || 16))));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  const frames: string[] = [];
  const lastIndex = Math.max(1, count - 1);
  for (let i = 0; i < count; i++) {
    if (signal.aborted) break;
    const time = (duration * i) / lastIndex;
    video.currentTime = Math.min(time, Math.max(0, duration - 0.05));
    if (video.seeking || Math.abs(video.currentTime - time) > 0.04) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          cleanup();
          reject(new DOMException('Aborted', 'AbortError'));
        };
        const onSeeked = () => {
          cleanup();
          resolve();
        };
        const cleanup = () => {
          video.removeEventListener('seeked', onSeeked);
          signal.removeEventListener('abort', onAbort);
        };
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        video.addEventListener('seeked', onSeeked, { once: true });
        signal.addEventListener('abort', onAbort, { once: true });
      });
    }
    ctx.drawImage(video, 0, 0, width, height);
    frames.push(canvas.toDataURL('image/jpeg', 0.7));
  }

  video.removeAttribute('src');
  video.load();
  return frames;
}

export const VideoTrimStrip: React.FC<VideoTrimStripProps> = ({
  src,
  busy = false,
  busyLabel = 'Preparing clip…',
  source,
  onConfirm,
  onDiscard,
  onRerecord,
  onChooseAnotherFile,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | 'start' | 'end'>(null);
  const startRef = useRef(0);
  const endRef = useRef(0);
  const durationRef = useRef(0);

  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [stripError, setStripError] = useState<string | null>(null);

  startRef.current = start;
  endRef.current = end;
  durationRef.current = duration;

  useEffect(() => {
    const controller = new AbortController();
    setFrames([]);
    setStripError(null);
    void sampleFilmstrip(src, FRAME_COUNT, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setFrames(next);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setStripError(err instanceof Error ? err.message : 'Could not build the video strip.');
      });
    return () => controller.abort();
  }, [src]);

  const applyStart = useCallback((next: number) => {
    const maxStart = Math.max(0, endRef.current - MIN_TRIM_SECONDS);
    setStart(clamp(next, 0, maxStart));
  }, []);

  const applyEnd = useCallback((next: number) => {
    const dur = durationRef.current;
    const minEnd = Math.min(dur, startRef.current + MIN_TRIM_SECONDS);
    setEnd(clamp(next, minEnd, dur));
  }, []);

  const timeFromClientX = useCallback((clientX: number): number => {
    const el = stripRef.current;
    const dur = durationRef.current;
    if (!el || dur <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * dur;
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || duration <= 0) return;
    const el = stripRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const startX = (start / duration) * rect.width;
    const endX = (end / duration) * rect.width;
    const distStart = Math.abs(x - startX);
    const distEnd = Math.abs(x - endX);
    const handle: 'start' | 'end' =
      distStart <= HANDLE_HIT_PX && distStart <= distEnd
        ? 'start'
        : distEnd <= HANDLE_HIT_PX
          ? 'end'
          : distStart < distEnd
            ? 'start'
            : 'end';
    dragRef.current = handle;
    el.setPointerCapture(event.pointerId);
    const time = timeFromClientX(event.clientX);
    if (handle === 'start') applyStart(time);
    else applyEnd(time);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || busy) return;
    const time = timeFromClientX(event.clientX);
    if (dragRef.current === 'start') applyStart(time);
    else applyEnd(time);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    const video = videoRef.current;
    if (video) {
      video.currentTime = startRef.current;
      setPlayhead(startRef.current);
    }
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(nextDuration);
    setStart(0);
    setEnd(nextDuration);
    setPlayhead(0);
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video || busy || duration <= 0) return;
    if (playing) {
      video.pause();
      setPlaying(false);
      return;
    }
    if (video.currentTime < start || video.currentTime >= end - 0.04) {
      video.currentTime = start;
    }
    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setPlayhead(t);
    if (t >= end - 0.04) {
      video.pause();
      video.currentTime = start;
      setPlayhead(start);
      setPlaying(false);
    }
  };

  const startPct = duration > 0 ? (start / duration) * 100 : 0;
  const endPct = duration > 0 ? (end / duration) * 100 : 100;
  const playheadPct = duration > 0 ? (playhead / duration) * 100 : 0;
  const keepLength = Math.max(0, end - start);

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        className="w-full max-h-52 rounded-lg bg-black"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          const video = videoRef.current;
          if (video) video.currentTime = start;
          setPlaying(false);
        }}
      />
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Drag the handles to cut the start and end before posting.
      </p>
      <div
        ref={stripRef}
        role="slider"
        aria-label="Trim range"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={start}
        tabIndex={busy ? -1 : 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative h-14 w-full select-none overflow-hidden rounded-md bg-slate-950 ${busy ? 'opacity-60 pointer-events-none' : 'cursor-ew-resize'}`}
      >
        <div className="absolute inset-0 flex">
          {(frames.length > 0 ? frames : Array.from({ length: FRAME_COUNT }, () => '')).map((frame, index) => (
            <div
              key={index}
              className="h-full flex-1 border-r border-black/40 last:border-r-0 bg-slate-800"
              style={frame ? { backgroundImage: `url(${frame})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
            />
          ))}
        </div>
        <div
          className="absolute inset-y-0 left-0 bg-black/55"
          style={{ width: `${startPct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-black/55"
          style={{ width: `${Math.max(0, 100 - endPct)}%` }}
        />
        <div
          className="absolute inset-y-0 border-y-2 border-amber-500 bg-amber-400/10"
          style={{ left: `${startPct}%`, width: `${Math.max(1, endPct - startPct)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 z-10 w-1.5 -ml-0.5 rounded-sm bg-amber-500 shadow"
          style={{ left: `${startPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 z-10 w-1.5 -ml-0.5 rounded-sm bg-amber-500 shadow"
          style={{ left: `${endPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 z-20 w-0.5 bg-white"
          style={{ left: `${playheadPct}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
        <span>
          {formatClipTime(start)} – {formatClipTime(end)}
        </span>
        <span>Keep {formatClipTime(keepLength)}</span>
      </div>
      {stripError ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{stripError}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void togglePlay()}
          disabled={busy || duration <= 0}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
        >
          {playing ? 'Pause' : 'Play selection'}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(start, end)}
          disabled={busy || duration <= 0 || keepLength < MIN_TRIM_SECONDS}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white"
        >
          {busy ? busyLabel : 'Use this clip'}
        </button>
        {source === 'webcam' && onRerecord ? (
          <button
            type="button"
            onClick={onRerecord}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            Re-record
          </button>
        ) : null}
        {source === 'file' && onChooseAnotherFile ? (
          <button
            type="button"
            onClick={onChooseAnotherFile}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
          >
            Choose another file
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDiscard}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  );
};
