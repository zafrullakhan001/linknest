export const MIN_TRIM_SECONDS = 0.3;
export const FULL_CLIP_EPSILON = 0.05;

export function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

export function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogv';
  return 'webm';
}

export interface TrimVideoOptions {
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  signal?: AbortSignal;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const webkit = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return window.AudioContext || webkit;
}

function waitForEvent(target: EventTarget, event: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      target.removeEventListener(event, onEvent);
      signal?.removeEventListener('abort', onAbort);
    };
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    target.addEventListener(event, onEvent, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function loadVideo(url: string, signal?: AbortSignal): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.preload = 'auto';
  video.src = url;
  video.load();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not load the video for trimming.'));
    };
    const onReady = () => {
      cleanup();
      resolve(video);
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
      resolve(video);
      return;
    }
    video.addEventListener('loadedmetadata', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
  const duration = Number.isFinite(video.duration) ? video.duration : time;
  const target = Math.min(Math.max(0, time), Math.max(0, duration - 0.001));
  if (Math.abs(video.currentTime - target) < 0.02 && !video.seeking) return;
  const seeked = waitForEvent(video, 'seeked', signal);
  video.currentTime = target;
  await seeked;
}

function captureElementStream(video: HTMLVideoElement, fps: number): MediaStream | null {
  const el = video as HTMLVideoElement & {
    captureStream?: (frameRate?: number) => MediaStream;
    webkitCaptureStream?: (frameRate?: number) => MediaStream;
  };
  try {
    if (typeof el.captureStream === 'function') return el.captureStream(fps);
    if (typeof el.webkitCaptureStream === 'function') return el.webkitCaptureStream(fps);
  } catch {
    return null;
  }
  return null;
}

function canCaptureCanvasStream(): boolean {
  return typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

export async function trimVideoBlob(
  source: Blob,
  startSec: number,
  endSec: number,
  options: TrimVideoOptions = {},
): Promise<Blob> {
  const { videoBitsPerSecond, audioBitsPerSecond, signal } = options;
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Trimming is not supported in this browser.');
  }

  const objectUrl = URL.createObjectURL(source);
  let video: HTMLVideoElement | null = null;
  let audioContext: AudioContext | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let canvasStream: MediaStream | null = null;
  let combinedStream: MediaStream | null = null;
  let drawRaf = 0;
  let watchRaf = 0;
  let recorder: MediaRecorder | null = null;

  const cleanup = () => {
    if (drawRaf) cancelAnimationFrame(drawRaf);
    if (watchRaf) cancelAnimationFrame(watchRaf);
    try { recorder?.stop(); } catch { /* ignore */ }
    combinedStream?.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* ignore */ }
    });
    canvasStream?.getTracks().forEach((track) => {
      try { track.stop(); } catch { /* ignore */ }
    });
    if (audioContext) {
      void audioContext.close().catch(() => undefined);
    }
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    URL.revokeObjectURL(objectUrl);
  };

  try {
    video = await loadVideo(objectUrl, signal);
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Could not read the video duration.');
    }

    const start = Math.max(0, Math.min(startSec, duration));
    const end = Math.max(start + MIN_TRIM_SECONDS, Math.min(endSec, duration));
    if (end - start < MIN_TRIM_SECONDS) {
      throw new Error('Clip is too short. Keep at least 0.3 seconds.');
    }

    const isFullClip = start <= FULL_CLIP_EPSILON && end >= duration - FULL_CLIP_EPSILON;
    if (isFullClip) {
      cleanup();
      return source;
    }

    await seekVideo(video, start, signal);

    const fps = 24;
    const captured = captureElementStream(video, fps);
    captured?.getAudioTracks().forEach((track) => {
      try { track.stop(); } catch { /* ignore */ }
    });
    const capturedVideo = captured?.getVideoTracks()[0];
    let videoTrack: MediaStreamTrack | null = capturedVideo || null;

    if (!videoTrack) {
      if (!canCaptureCanvasStream()) {
        throw new Error('Trimming is not supported in this browser.');
      }
      canvas = document.createElement('canvas');
      canvas.width = Math.max(2, video.videoWidth || 640);
      canvas.height = Math.max(2, video.videoHeight || 360);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not prepare the video for trimming.');
      canvasStream = canvas.captureStream(fps);
      const draw = () => {
        if (!video || !canvas || !ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        drawRaf = requestAnimationFrame(draw);
      };
      draw();
      videoTrack = canvasStream.getVideoTracks()[0] || null;
    }

    if (!videoTrack) {
      throw new Error('Could not capture video for trimming.');
    }

    const tracks: MediaStreamTrack[] = [videoTrack];
    const AudioCtx = getAudioContextConstructor();
    if (AudioCtx) {
      try {
        video.muted = false;
        video.volume = 1;
        audioContext = new AudioCtx();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        const sourceNode = audioContext.createMediaElementSource(video);
        const dest = audioContext.createMediaStreamDestination();
        sourceNode.connect(dest);
        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) tracks.push(audioTrack);
      } catch {
        /* keep video-only if audio graph fails */
      }
    }

    combinedStream = new MediaStream(tracks);
    const mimeType = pickRecorderMimeType();
    const recorderOptions: MediaRecorderOptions = {};
    if (mimeType) recorderOptions.mimeType = mimeType;
    if (videoBitsPerSecond) recorderOptions.videoBitsPerSecond = videoBitsPerSecond;
    if (audioBitsPerSecond) recorderOptions.audioBitsPerSecond = audioBitsPerSecond;

    let created: MediaRecorder;
    try {
      created = new MediaRecorder(combinedStream, recorderOptions);
    } catch {
      created = mimeType
        ? new MediaRecorder(combinedStream, { mimeType })
        : new MediaRecorder(combinedStream);
    }
    recorder = created;

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const recorded = new Promise<Blob>((resolve, reject) => {
      const onAbort = () => {
        try { recorder?.stop(); } catch { /* ignore */ }
        reject(new DOMException('Aborted', 'AbortError'));
      };
      recorder!.onerror = () => {
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('Could not encode the trimmed clip.'));
      };
      recorder!.onstop = () => {
        signal?.removeEventListener('abort', onAbort);
        const mime = recorder!.mimeType || mimeType || source.type || 'video/webm';
        const blob = new Blob(chunks, { type: mime.split(';')[0] });
        if (blob.size < 1) {
          reject(new Error('Trimmed clip was empty. Please try again.'));
          return;
        }
        resolve(blob);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });

    try {
      await video.play();
    } catch {
      video.muted = true;
      await video.play();
    }
    recorder.start(200);

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        cleanupWatch();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const tick = () => {
        if (!video) return;
        if (video.ended || video.currentTime >= end - 0.02) {
          cleanupWatch();
          video.pause();
          resolve();
          return;
        }
        watchRaf = requestAnimationFrame(tick);
      };
      const cleanupWatch = () => {
        signal?.removeEventListener('abort', onAbort);
        if (watchRaf) cancelAnimationFrame(watchRaf);
        watchRaf = 0;
      };
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      tick();
    });

    recorder.stop();
    const blob = await recorded;
    cleanup();
    return blob;
  } catch (err) {
    cleanup();
    throw err;
  }
}
