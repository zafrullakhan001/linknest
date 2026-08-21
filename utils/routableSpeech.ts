/**
 * Play TTS audio on a specific output device via setSinkId.
 * Browser speechSynthesis cannot target a chosen speaker — this path can.
 */

export type RoutableSpeakHandlers = {
  onProgress?: (charIndex: number, charLength: number, text: string) => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
};

type SpeakOptions = {
  text: string;
  rate: number;
  sinkId: string;
  gender?: 'male' | 'female' | '';
  signal?: AbortSignal;
};

let sharedAudio: HTMLAudioElement | null = null;
let sharedObjectUrl: string | null = null;
let sharedAudioContext: AudioContext | null = null;

function resolveApiBase(): string {
  const envBase = (import.meta as any)?.env?.VITE_API_BASE;
  if (envBase) return envBase;
  if (typeof window !== 'undefined') {
    const path = window.location.pathname || '';
    if (path !== '/' && path.length > 1) {
      const cleanPath = path.replace(/\/[^/]*$/, '').replace(/\/$/, '');
      if (cleanPath && cleanPath !== '/') return `${cleanPath}/api`;
    }
  }
  return '/api';
}

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
  }
  return sharedAudio;
}

export function supportsSinkId(): boolean {
  if (typeof HTMLAudioElement === 'undefined') return false;
  return typeof HTMLAudioElement.prototype.setSinkId === 'function'
    || (typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype);
}

export async function ensureSinkPermission(deviceId: string): Promise<string> {
  if (!deviceId || typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return deviceId;
  }
  return deviceId;
}

export async function applySinkToElement(audio: HTMLAudioElement, deviceId: string): Promise<void> {
  if (!deviceId) return;
  const el = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };
  if (typeof el.setSinkId !== 'function') {
    throw new Error('This browser cannot route audio to a chosen speaker');
  }
  if (el.sinkId === deviceId) return;

  try {
    await el.setSinkId(deviceId);
    return;
  } catch (err) {
    // Permission often requires a one-time selectAudioOutput() grant.
    const md = navigator.mediaDevices as MediaDevices & {
      selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
    };
    if (typeof md.selectAudioOutput === 'function') {
      try {
        const chosen = await md.selectAudioOutput({ deviceId });
        const permittedId = chosen?.deviceId || deviceId;
        await el.setSinkId(permittedId);
        return;
      } catch {
        // fall through
      }
    }
    throw err;
  }
}

async function applySinkToAudioContext(deviceId: string): Promise<void> {
  if (!deviceId || typeof AudioContext === 'undefined') return;
  if (!('setSinkId' in AudioContext.prototype)) return;
  try {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      sharedAudioContext = new AudioContext(deviceId ? ({ sinkId: deviceId } as AudioContextOptions) : undefined);
    }
    const ctx = sharedAudioContext as AudioContext & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };
    if (typeof ctx.setSinkId === 'function' && ctx.sinkId !== deviceId) {
      await ctx.setSinkId(deviceId);
    }
    if (ctx.state === 'suspended') await ctx.resume();
  } catch {
    // Element setSinkId is the source of truth for playback.
  }
}

export function stopRoutableSpeech(): void {
  try {
    if (sharedAudio) {
      sharedAudio.pause();
      sharedAudio.removeAttribute('src');
      sharedAudio.load();
    }
  } catch {
    // ignore
  }
  if (sharedObjectUrl) {
    URL.revokeObjectURL(sharedObjectUrl);
    sharedObjectUrl = null;
  }
}

export async function speakRoutable(
  options: SpeakOptions,
  handlers: RoutableSpeakHandlers = {}
): Promise<void> {
  const text = options.text.trim();
  if (!text) return;

  stopRoutableSpeech();

  const sinkId = options.sinkId
    ? await ensureSinkPermission(options.sinkId)
    : '';

  const response = await fetch(`${resolveApiBase()}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    signal: options.signal,
    body: JSON.stringify({
      text,
      rate: options.rate,
      gender: options.gender || '',
    }),
  });

  if (!response.ok) {
    let message = `TTS failed (${response.status})`;
    try {
      const err = await response.json();
      if (err?.error) message = String(err.error);
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  sharedObjectUrl = objectUrl;

  const audio = getAudio();
  audio.defaultPlaybackRate = 1;
  audio.playbackRate = 1; // rate already baked into WAV
  audio.src = objectUrl;

  if (sinkId) {
    await applySinkToAudioContext(sinkId);
    await applySinkToElement(audio, sinkId);
  }

  const syncProgress = () => {
    if (!audio.duration || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const ratio = Math.min(1, Math.max(0, audio.currentTime / audio.duration));
    const charIndex = Math.min(text.length - 1, Math.floor(ratio * text.length));
    const rest = text.slice(charIndex);
    const word = rest.match(/^\S+/)?.[0] || text.slice(charIndex, charIndex + 1) || ' ';
    handlers.onProgress?.(charIndex, Math.max(1, word.length), text);
  };

  await new Promise<void>((resolve, reject) => {
    const onEnded = () => {
      cleanup();
      handlers.onProgress?.(Math.max(0, text.length - 1), 1, text);
      handlers.onEnd?.();
      resolve();
    };
    const onError = () => {
      cleanup();
      const err = new Error('Audio playback failed');
      handlers.onError?.(err);
      reject(err);
    };
    const cleanup = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('timeupdate', syncProgress);
    };

    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('timeupdate', syncProgress);

    if (options.signal) {
      const onAbort = () => {
        cleanup();
        stopRoutableSpeech();
        resolve();
      };
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    void audio.play().then(() => {
      handlers.onProgress?.(0, 1, text);
    }).catch((err) => {
      cleanup();
      handlers.onError?.(err);
      reject(err);
    });
  });
}
