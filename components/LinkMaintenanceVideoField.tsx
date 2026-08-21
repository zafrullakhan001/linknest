import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VideoTrimStrip } from './VideoTrimStrip';
import { uploadLinkMaintenanceVideo } from '../services/storageService';
import { WebcamBackgroundBlurEngine } from '../utils/webcamBackgroundBlur';
import { extensionForMime, pickRecorderMimeType, trimVideoBlob } from '../utils/trimVideoBlob';

type PendingClip = {
  blob: Blob;
  mime: string;
  objectUrl: string;
  source: 'webcam' | 'file';
};

interface LinkMaintenanceVideoFieldProps {
  value?: string;
  onChange: (url: string) => void;
}

const CAMERA_STORAGE_KEY = 'linknest.maintenanceVideo.cameraId';
const MIC_STORAGE_KEY = 'linknest.maintenanceVideo.micId';
const QUALITY_STORAGE_KEY = 'linknest.maintenanceVideo.quality';
const MIRROR_STORAGE_KEY = 'linknest.maintenanceVideo.mirror';
const NOISE_STORAGE_KEY = 'linknest.maintenanceVideo.noiseSuppression';
const EDGE_CHOKE_STORAGE_KEY = 'linknest.maintenanceVideo.edgeChoke';
const ZOOM_STORAGE_KEY = 'linknest.maintenanceVideo.zoom';
const SETTINGS_EXPANDED_KEY = 'linknest.maintenanceVideo.settingsExpanded';
const DEFAULT_BRIGHTNESS = 1;
const DEFAULT_CONTRAST = 1;
const DEFAULT_SATURATION = 1;
const DEFAULT_MIC_GAIN = 1;
const DEFAULT_BLUR_AMOUNT = 12;
const DEFAULT_EDGE_CHOKE = 3;
const DEFAULT_ZOOM = 1;

type QualityId = 'fast' | 'balanced' | 'high';

const QUALITY_PRESETS: Record<QualityId, {
  label: string;
  hint: string;
  width: number;
  height: number;
  fps: number;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
}> = {
  fast: {
    label: 'Fast (480p)',
    hint: 'More compression, snappier preview and upload',
    width: 854,
    height: 480,
    fps: 24,
    videoBitsPerSecond: 800_000,
    audioBitsPerSecond: 64_000,
  },
  balanced: {
    label: 'Balanced (720p)',
    hint: 'Good quality with moderate file size',
    width: 1280,
    height: 720,
    fps: 24,
    videoBitsPerSecond: 1_800_000,
    audioBitsPerSecond: 96_000,
  },
  high: {
    label: 'High (1080p)',
    hint: 'Best quality, larger file and slower upload',
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitsPerSecond: 4_000_000,
    audioBitsPerSecond: 128_000,
  },
};

function readStoredDeviceId(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function storeDeviceId(key: string, id: string): void {
  if (!id) return;
  try {
    localStorage.setItem(key, id);
  } catch {
    /* ignore quota / private mode */
  }
}

function readStoredQuality(): QualityId {
  const value = readStoredDeviceId(QUALITY_STORAGE_KEY);
  if (value === 'fast' || value === 'balanced' || value === 'high') return value;
  return 'balanced';
}

function readStoredFlag(key: string, fallback = false): boolean {
  try {
    const value = localStorage.getItem(key);
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function storeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore quota / private mode */
  }
}

function canCaptureCanvasStream(): boolean {
  return typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  const webkit = (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return window.AudioContext || webkit;
}

function deviceLabel(device: MediaDeviceInfo, index: number, kind: 'camera' | 'mic'): string {
  const name = device.label?.trim();
  if (name) return name;
  return kind === 'camera' ? `Camera ${index + 1}` : `Microphone ${index + 1}`;
}

function buildConstraints(
  cameraId: string,
  micId: string,
  quality: QualityId,
  noiseSuppression: boolean,
  mode: 'exact' | 'ideal'
): MediaStreamConstraints {
  const preset = QUALITY_PRESETS[quality];
  const video: MediaTrackConstraints = {
    width: { ideal: preset.width },
    height: { ideal: preset.height },
    frameRate: { ideal: preset.fps },
  };
  if (cameraId) {
    video.deviceId = mode === 'exact' ? { exact: cameraId } : { ideal: cameraId };
  }
  const audio: MediaTrackConstraints = {
    echoCancellation: noiseSuppression,
    noiseSuppression,
    autoGainControl: false,
  };
  if (micId) {
    audio.deviceId = mode === 'exact' ? { exact: micId } : { ideal: micId };
  }
  return { video, audio };
}

async function acquireStream(
  cameraId: string,
  micId: string,
  quality: QualityId,
  noiseSuppression: boolean
): Promise<MediaStream> {
  const tryGet = (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints);
  if (cameraId || micId) {
    try {
      return await tryGet(buildConstraints(cameraId, micId, quality, noiseSuppression, 'exact'));
    } catch {
      try {
        return await tryGet(buildConstraints(cameraId, micId, quality, noiseSuppression, 'ideal'));
      } catch {
        /* fall through to defaults */
      }
    }
  }
  try {
    return await tryGet(buildConstraints('', '', quality, noiseSuppression, 'ideal'));
  } catch {
    try {
      return await tryGet({ video: true, audio: true });
    } catch {
      return await tryGet({ video: true, audio: false });
    }
  }
}

function formatRecordingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function readStoredEdgeChoke(): number {
  try {
    const raw = localStorage.getItem(EDGE_CHOKE_STORAGE_KEY);
    if (raw == null) return DEFAULT_EDGE_CHOKE;
    const value = Number(raw);
    if (Number.isFinite(value)) return Math.min(10, Math.max(0, Math.round(value)));
  } catch {
    /* ignore */
  }
  return DEFAULT_EDGE_CHOKE;
}

function readStoredZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw == null) return DEFAULT_ZOOM;
    const value = Number(raw);
    if (Number.isFinite(value)) return Math.min(2.5, Math.max(1, Math.round(value * 20) / 20));
  } catch {
    /* ignore */
  }
  return DEFAULT_ZOOM;
}

function trackDeviceId(track: MediaStreamTrack | undefined): string {
  if (!track) return '';
  try {
    return track.getSettings().deviceId || '';
  } catch {
    return '';
  }
}

function drawMicWaveform(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode | null,
  data: Uint8Array | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cssWidth = Math.max(1, canvas.clientWidth);
  const cssHeight = Math.max(1, canvas.clientHeight);
  const dpr = window.devicePixelRatio || 1;
  const pixelW = Math.floor(cssWidth * dpr);
  const pixelH = Math.floor(cssHeight * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, cssHeight / 2);
  ctx.lineTo(cssWidth, cssHeight / 2);
  ctx.stroke();

  if (!analyser || !data || data.length !== analyser.fftSize) return;
  analyser.getByteTimeDomainData(data);

  let peak = 0;
  ctx.beginPath();
  const slice = cssWidth / data.length;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    peak = Math.max(peak, Math.abs(v));
    const y = cssHeight / 2 + v * (cssHeight / 2 - 2);
    if (i === 0) ctx.moveTo(0, y);
    else ctx.lineTo(i * slice, y);
  }
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = peak > 0.85 ? '#ef4444' : peak > 0.05 ? '#f59e0b' : '#64748b';
  ctx.stroke();
}

const AvSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 0.05, disabled, formatValue, onChange }) => (
  <label className="block">
    <div className="mb-0.5 flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
      <span>{label}</span>
      <span>{formatValue ? formatValue(value) : `${value.toFixed(1)}×`}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-amber-600 disabled:opacity-50"
    />
  </label>
);

export const LinkMaintenanceVideoField: React.FC<LinkMaintenanceVideoFieldProps> = ({
  value,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const brandBgInputRef = useRef<HTMLInputElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const timeDomainDataRef = useRef<Uint8Array | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawRafRef = useRef<number>(0);
  const pipelineGenRef = useRef(0);
  const selectedCameraIdRef = useRef('');
  const selectedMicIdRef = useRef('');
  const brightnessRef = useRef(DEFAULT_BRIGHTNESS);
  const contrastRef = useRef(DEFAULT_CONTRAST);
  const saturationRef = useRef(DEFAULT_SATURATION);
  const micGainRef = useRef(DEFAULT_MIC_GAIN);
  const backgroundBlurRef = useRef(false);
  const blurAmountRef = useRef(DEFAULT_BLUR_AMOUNT);
  const edgeChokeRef = useRef(readStoredEdgeChoke());
  const zoomRef = useRef(readStoredZoom());
  const blurEngineRef = useRef<WebcamBackgroundBlurEngine | null>(null);
  const isRecordingRef = useRef(false);
  const qualityRef = useRef<QualityId>(readStoredQuality());
  const mirrorRef = useRef(readStoredFlag(MIRROR_STORAGE_KEY, false));
  const noiseSuppressionRef = useRef(readStoredFlag(NOISE_STORAGE_KEY, true));
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const brandObjectUrlRef = useRef<string | null>(null);
  const pendingClipUrlRef = useRef<string | null>(null);
  const trimAbortRef = useRef<AbortController | null>(null);

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [pendingClip, setPendingClip] = useState<PendingClip | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookNotBakedIn, setLookNotBakedIn] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [selectedMicId, setSelectedMicId] = useState('');
  const [brightness, setBrightness] = useState(DEFAULT_BRIGHTNESS);
  const [contrast, setContrast] = useState(DEFAULT_CONTRAST);
  const [saturation, setSaturation] = useState(DEFAULT_SATURATION);
  const [micGain, setMicGain] = useState(DEFAULT_MIC_GAIN);
  const [backgroundBlur, setBackgroundBlur] = useState(false);
  const [blurAmount, setBlurAmount] = useState(DEFAULT_BLUR_AMOUNT);
  const [edgeChoke, setEdgeChoke] = useState(() => readStoredEdgeChoke());
  const [zoom, setZoom] = useState(() => readStoredZoom());
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [blurLoading, setBlurLoading] = useState(false);
  const [quality, setQuality] = useState<QualityId>(() => readStoredQuality());
  const [mirror, setMirror] = useState(() => readStoredFlag(MIRROR_STORAGE_KEY, false));
  const [noiseSuppression, setNoiseSuppression] = useState(() => readStoredFlag(NOISE_STORAGE_KEY, true));
  const [settingsExpanded, setSettingsExpanded] = useState(() => readStoredFlag(SETTINGS_EXPANDED_KEY, false));
  const [brandBackgroundName, setBrandBackgroundName] = useState<string | null>(null);
  const [brandBackgroundPreview, setBrandBackgroundPreview] = useState<string | null>(null);

  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';

  const stopDrawLoop = useCallback(() => {
    pipelineGenRef.current += 1;
    if (drawRafRef.current) {
      cancelAnimationFrame(drawRafRef.current);
      drawRafRef.current = 0;
    }
  }, []);

  const teardownProcessing = useCallback(() => {
    stopDrawLoop();
    canvasStreamRef.current?.getTracks().forEach((track) => track.stop());
    canvasStreamRef.current = null;
    processedStreamRef.current = null;
    try { sourceNodeRef.current?.disconnect(); } catch { /* ignore */ }
    try { gainNodeRef.current?.disconnect(); } catch { /* ignore */ }
    try { analyserNodeRef.current?.disconnect(); } catch { /* ignore */ }
    sourceNodeRef.current = null;
    gainNodeRef.current = null;
    analyserNodeRef.current = null;
    timeDomainDataRef.current = null;
    const audioCtx = audioContextRef.current;
    audioContextRef.current = null;
    if (audioCtx && audioCtx.state !== 'closed') {
      void audioCtx.close().catch(() => undefined);
    }
    rawStreamRef.current?.getTracks().forEach((track) => track.stop());
    rawStreamRef.current = null;
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }, [stopDrawLoop]);

  const clearPendingClip = useCallback(() => {
    trimAbortRef.current?.abort();
    trimAbortRef.current = null;
    if (pendingClipUrlRef.current) {
      URL.revokeObjectURL(pendingClipUrlRef.current);
      pendingClipUrlRef.current = null;
    }
    setPendingClip(null);
  }, []);

  const setPendingFromBlob = useCallback((blob: Blob, mime: string, source: PendingClip['source']) => {
    if (pendingClipUrlRef.current) {
      URL.revokeObjectURL(pendingClipUrlRef.current);
      pendingClipUrlRef.current = null;
    }
    const objectUrl = URL.createObjectURL(blob);
    pendingClipUrlRef.current = objectUrl;
    setPendingClip({ blob, mime, objectUrl, source });
  }, []);

  useEffect(() => {
    blurEngineRef.current = new WebcamBackgroundBlurEngine();
    return () => {
      blurEngineRef.current?.close();
      blurEngineRef.current = null;
      if (brandObjectUrlRef.current) {
        URL.revokeObjectURL(brandObjectUrlRef.current);
        brandObjectUrlRef.current = null;
      }
      trimAbortRef.current?.abort();
      if (pendingClipUrlRef.current) {
        URL.revokeObjectURL(pendingClipUrlRef.current);
        pendingClipUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    teardownProcessing();
  }, [teardownProcessing]);

  const refreshDevices = useCallback(async (): Promise<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }> => {
    if (!navigator.mediaDevices?.enumerateDevices) return { cameras: [], mics: [] };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const nextCameras = devices.filter((device) => device.kind === 'videoinput');
      const nextMics = devices.filter((device) => device.kind === 'audioinput');
      setCameras(nextCameras);
      setMics(nextMics);
      return { cameras: nextCameras, mics: nextMics };
    } catch {
      return { cameras: [], mics: [] };
    }
  }, []);

  useEffect(() => {
    if (!isPreviewing || !navigator.mediaDevices?.addEventListener) return;
    const onDeviceChange = () => { void refreshDevices(); };
    navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
  }, [isPreviewing, refreshDevices]);

  useEffect(() => {
    if (!isRecording) {
      setRecordingElapsed(0);
      return;
    }
    const startedAt = Date.now();
    setRecordingElapsed(0);
    const timer = window.setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  const syncSelectedFromStream = (
    stream: MediaStream,
    deviceLists?: { cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }
  ) => {
    const videoId = trackDeviceId(stream.getVideoTracks()[0])
      || selectedCameraIdRef.current
      || deviceLists?.cameras.find((device) => device.deviceId)?.deviceId
      || '';
    const audioId = trackDeviceId(stream.getAudioTracks()[0])
      || selectedMicIdRef.current
      || deviceLists?.mics.find((device) => device.deviceId)?.deviceId
      || '';
    if (videoId) {
      selectedCameraIdRef.current = videoId;
      setSelectedCameraId(videoId);
      storeDeviceId(CAMERA_STORAGE_KEY, videoId);
    }
    if (audioId) {
      selectedMicIdRef.current = audioId;
      setSelectedMicId(audioId);
      storeDeviceId(MIC_STORAGE_KEY, audioId);
    }
  };

  const startDrawLoop = () => {
    const gen = pipelineGenRef.current;
    const video = liveVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (!video || !canvas) return;

    const draw = () => {
      if (pipelineGenRef.current !== gen) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const preset = QUALITY_PRESETS[qualityRef.current];
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          const scale = Math.min(1, preset.width / video.videoWidth, preset.height / video.videoHeight);
          const targetWidth = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
          const targetHeight = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
          if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
          }
        }
        if (canvas.width > 0 && canvas.height > 0) {
          const engine = blurEngineRef.current;
          if (engine) {
            engine.drawFrame(ctx, video, {
              blurEnabled: backgroundBlurRef.current,
              blurAmount: blurAmountRef.current,
              brightness: brightnessRef.current,
              contrast: contrastRef.current,
              saturation: saturationRef.current,
              mirror: mirrorRef.current,
              backgroundImage: backgroundImageRef.current,
              edgeChoke: edgeChokeRef.current,
              zoom: zoomRef.current,
            });
          } else {
            ctx.save();
            if (mirrorRef.current) {
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
            }
            const zoomScale = Math.min(2.5, Math.max(1, zoomRef.current));
            if (zoomScale > 1.001) {
              ctx.translate(canvas.width / 2, canvas.height / 2);
              ctx.scale(zoomScale, zoomScale);
              ctx.translate(-canvas.width / 2, -canvas.height / 2);
            }
            try {
              ctx.filter = `brightness(${brightnessRef.current}) contrast(${contrastRef.current}) saturate(${saturationRef.current})`;
            } catch {
              ctx.filter = 'none';
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
          }
        }
      }
      if (waveformCanvasRef.current) {
        drawMicWaveform(
          waveformCanvasRef.current,
          analyserNodeRef.current,
          timeDomainDataRef.current
        );
      }
      drawRafRef.current = requestAnimationFrame(draw);
    };
    drawRafRef.current = requestAnimationFrame(draw);
  };

  const setupPipeline = async (rawStream: MediaStream) => {
    rawStreamRef.current = rawStream;
    const video = liveVideoRef.current;
    const canvas = previewCanvasRef.current;
    if (video) {
      video.srcObject = rawStream;
      try {
        await video.play();
      } catch {
        /* autoplay can still succeed muted on the next frame */
      }
    }
    if (canvas && canvas.width === 0) {
      canvas.width = 640;
      canvas.height = 480;
    }
    startDrawLoop();

    const tracks: MediaStreamTrack[] = [];
    let bakedVideo = false;
    if (canvas && canCaptureCanvasStream()) {
      try {
        const canvasStream = canvas.captureStream(QUALITY_PRESETS[qualityRef.current].fps);
        canvasStreamRef.current = canvasStream;
        const canvasTrack = canvasStream.getVideoTracks()[0];
        if (canvasTrack) {
          tracks.push(canvasTrack);
          bakedVideo = true;
        }
      } catch {
        bakedVideo = false;
      }
    }
    if (!bakedVideo) {
      const rawVideo = rawStream.getVideoTracks()[0];
      if (rawVideo) tracks.push(rawVideo);
    }
    setLookNotBakedIn(!bakedVideo);

    const AudioCtx = getAudioContextConstructor();
    const rawAudio = rawStream.getAudioTracks()[0];
    if (AudioCtx && rawAudio) {
      try {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(rawStream);
        const gain = audioCtx.createGain();
        gain.gain.value = micGainRef.current;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.35;
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(gain);
        gain.connect(analyser);
        analyser.connect(dest);
        sourceNodeRef.current = source;
        gainNodeRef.current = gain;
        analyserNodeRef.current = analyser;
        timeDomainDataRef.current = new Uint8Array(analyser.fftSize);
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => undefined);
        }
        const processedAudio = dest.stream.getAudioTracks()[0];
        if (processedAudio) tracks.push(processedAudio);
      } catch {
        if (rawAudio) tracks.push(rawAudio);
      }
    } else if (rawAudio) {
      tracks.push(rawAudio);
    }

    processedStreamRef.current = new MediaStream(tracks);
  };

  const waitForPreviewElements = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  const startCamera = async () => {
    setError(null);
    if (!canRecord) {
      setError('Camera recording is not available in this browser. You can still upload a video file.');
      return;
    }
    setIsPreviewing(true);
    try {
      const stream = await acquireStream(
        readStoredDeviceId(CAMERA_STORAGE_KEY),
        readStoredDeviceId(MIC_STORAGE_KEY),
        qualityRef.current,
        noiseSuppressionRef.current
      );
      await waitForPreviewElements();
      await setupPipeline(stream);
      const deviceLists = await refreshDevices();
      syncSelectedFromStream(stream, deviceLists);
    } catch {
      teardownProcessing();
      setIsPreviewing(false);
      setError('Could not access the webcam. Check camera permissions, or upload a video file instead.');
    }
  };

  const restartPreview = async () => {
    if (isRecordingRef.current) return;
    setError(null);
    setIsSwitching(true);
    try {
      teardownProcessing();
      const stream = await acquireStream(
        selectedCameraIdRef.current,
        selectedMicIdRef.current,
        qualityRef.current,
        noiseSuppressionRef.current
      );
      await waitForPreviewElements();
      await setupPipeline(stream);
      const deviceLists = await refreshDevices();
      syncSelectedFromStream(stream, deviceLists);
    } catch {
      setError('Could not switch camera or microphone. Check device permissions.');
    } finally {
      setIsSwitching(false);
    }
  };

  const cancelCamera = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsPreviewing(false);
    setLookNotBakedIn(false);
    teardownProcessing();
  };

  const startRecording = () => {
    const recordStream = processedStreamRef.current || rawStreamRef.current;
    if (!recordStream) return;
    setError(null);
    chunksRef.current = [];
    try {
      const mimeType = pickRecorderMimeType();
      const preset = QUALITY_PRESETS[qualityRef.current];
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: preset.videoBitsPerSecond,
        audioBitsPerSecond: preset.audioBitsPerSecond,
      };
      if (mimeType) recorderOptions.mimeType = mimeType;
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(recordStream, recorderOptions);
      } catch {
        recorder = mimeType
          ? new MediaRecorder(recordStream, { mimeType })
          : new MediaRecorder(recordStream);
      }
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setError('Recording failed. Try uploading a video file instead.');
        isRecordingRef.current = false;
        setIsRecording(false);
      };
      recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
    } catch {
      setError('Recording is not supported in this browser. Upload a video file instead.');
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.onstop = () => {
      isRecordingRef.current = false;
      setIsRecording(false);
      const mime = (recorder.mimeType || pickRecorderMimeType() || 'video/webm').split(';')[0];
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      recorderRef.current = null;
      setIsPreviewing(false);
      setLookNotBakedIn(false);
      teardownProcessing();
      if (blob.size < 1) {
        setError('Recording was empty. Please try again.');
        return;
      }
      setError(null);
      setPendingFromBlob(blob, mime, 'webcam');
    };
    recorder.stop();
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('Please choose a video file.');
      return;
    }
    setError(null);
    setPendingFromBlob(file, file.type || 'video/webm', 'file');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmPendingClip = async (startSec: number, endSec: number) => {
    const clip = pendingClip;
    if (!clip) return;
    trimAbortRef.current?.abort();
    const abort = new AbortController();
    trimAbortRef.current = abort;
    setIsUploading(true);
    setError(null);
    try {
      const preset = QUALITY_PRESETS[qualityRef.current];
      const trimmed = await trimVideoBlob(clip.blob, startSec, endSec, {
        videoBitsPerSecond: preset.videoBitsPerSecond,
        audioBitsPerSecond: preset.audioBitsPerSecond,
        signal: abort.signal,
      });
      const mime = trimmed.type || clip.mime;
      const originalName = clip.blob instanceof File ? clip.blob.name : '';
      const filename = originalName && trimmed === clip.blob
        ? originalName
        : `recording.${extensionForMime(mime)}`;
      const url = await uploadLinkMaintenanceVideo(trimmed, filename);
      clearPendingClip();
      onChange(url);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to prepare the clip');
    } finally {
      setIsUploading(false);
    }
  };

  const discardPendingClip = () => {
    clearPendingClip();
    setError(null);
  };

  const rerecordPendingClip = () => {
    clearPendingClip();
    setError(null);
    void startCamera();
  };

  const handleCameraChange = (id: string) => {
    if (isRecordingRef.current) return;
    selectedCameraIdRef.current = id;
    setSelectedCameraId(id);
    storeDeviceId(CAMERA_STORAGE_KEY, id);
    void restartPreview();
  };

  const handleMicChange = (id: string) => {
    if (isRecordingRef.current) return;
    selectedMicIdRef.current = id;
    setSelectedMicId(id);
    storeDeviceId(MIC_STORAGE_KEY, id);
    void restartPreview();
  };

  const handleQualityChange = (next: QualityId) => {
    if (isRecordingRef.current) return;
    qualityRef.current = next;
    setQuality(next);
    storeDeviceId(QUALITY_STORAGE_KEY, next);
    void restartPreview();
  };

  const handleMirrorChange = (enabled: boolean) => {
    mirrorRef.current = enabled;
    setMirror(enabled);
    storeFlag(MIRROR_STORAGE_KEY, enabled);
  };

  const handleNoiseSuppressionChange = (enabled: boolean) => {
    if (isRecordingRef.current) return;
    noiseSuppressionRef.current = enabled;
    setNoiseSuppression(enabled);
    storeFlag(NOISE_STORAGE_KEY, enabled);
    void restartPreview();
  };

  const updateBrightness = (next: number) => {
    brightnessRef.current = next;
    setBrightness(next);
  };
  const updateContrast = (next: number) => {
    contrastRef.current = next;
    setContrast(next);
  };
  const updateSaturation = (next: number) => {
    saturationRef.current = next;
    setSaturation(next);
  };
  const updateMicGain = (next: number) => {
    micGainRef.current = next;
    setMicGain(next);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = next;
    }
  };
  const updateBlurAmount = (next: number) => {
    blurAmountRef.current = next;
    setBlurAmount(next);
  };
  const updateEdgeChoke = (next: number) => {
    edgeChokeRef.current = next;
    setEdgeChoke(next);
    storeDeviceId(EDGE_CHOKE_STORAGE_KEY, String(next));
  };
  const updateZoom = (next: number) => {
    zoomRef.current = next;
    setZoom(next);
    storeDeviceId(ZOOM_STORAGE_KEY, String(next));
  };

  const ensureBackgroundEngine = async (): Promise<boolean> => {
    setBlurLoading(true);
    setError(null);
    try {
      if (!blurEngineRef.current) {
        blurEngineRef.current = new WebcamBackgroundBlurEngine();
      }
      await blurEngineRef.current.ensure();
      return true;
    } catch {
      setError('Could not load background effects. Check your connection and try again.');
      return false;
    } finally {
      setBlurLoading(false);
    }
  };

  const setBackgroundBlurEnabled = async (enabled: boolean) => {
    backgroundBlurRef.current = enabled;
    setBackgroundBlur(enabled);
    if (!enabled) return;
    if (blurEngineRef.current?.ready) return;
    const ok = await ensureBackgroundEngine();
    if (!ok) {
      backgroundBlurRef.current = false;
      setBackgroundBlur(false);
    }
  };

  const clearBrandBackground = () => {
    backgroundImageRef.current = null;
    if (brandObjectUrlRef.current) {
      URL.revokeObjectURL(brandObjectUrlRef.current);
      brandObjectUrlRef.current = null;
    }
    setBrandBackgroundName(null);
    setBrandBackgroundPreview(null);
    if (brandBgInputRef.current) brandBgInputRef.current.value = '';
  };

  const handleBrandBackground = async (file: File | undefined) => {
    if (!file) return;
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    const isImage = type === 'image/jpeg' || type === 'image/png' || type === 'image/jpg'
      || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');
    if (!isImage) {
      setError('Please choose a JPG or PNG image for the brand background.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Brand background must be 8MB or smaller.');
      return;
    }
    const ok = blurEngineRef.current?.ready ? true : await ensureBackgroundEngine();
    if (!ok) return;
    if (brandObjectUrlRef.current) {
      URL.revokeObjectURL(brandObjectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(file);
    brandObjectUrlRef.current = objectUrl;
    const image = new Image();
    image.onload = () => {
      backgroundImageRef.current = image;
      setBrandBackgroundName(file.name);
      setBrandBackgroundPreview(objectUrl);
      setError(null);
    };
    image.onerror = () => {
      clearBrandBackground();
      setError('Could not read that image. Try a different JPG or PNG.');
    };
    image.src = objectUrl;
    if (brandBgInputRef.current) brandBgInputRef.current.value = '';
  };

  const resetAdjustments = () => {
    updateBrightness(DEFAULT_BRIGHTNESS);
    updateContrast(DEFAULT_CONTRAST);
    updateSaturation(DEFAULT_SATURATION);
    updateMicGain(DEFAULT_MIC_GAIN);
    updateBlurAmount(DEFAULT_BLUR_AMOUNT);
    updateEdgeChoke(DEFAULT_EDGE_CHOKE);
    updateZoom(DEFAULT_ZOOM);
    backgroundBlurRef.current = false;
    setBackgroundBlur(false);
    handleMirrorChange(false);
  };

  const deviceSelectsDisabled = isRecording || isSwitching;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
        Maintenance video
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Record a webcam message or upload a video file (WebM, MP4, up to 50MB).
      </p>

      {value ? (
        <div className="space-y-2">
          <video src={value} controls playsInline className="w-full max-h-52 rounded-lg bg-black" />
          <button
            type="button"
            onClick={() => onChange('')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
          >
            Remove video
          </button>
        </div>
      ) : pendingClip ? (
        <VideoTrimStrip
          src={pendingClip.objectUrl}
          source={pendingClip.source}
          busy={isUploading}
          busyLabel="Preparing clip…"
          onConfirm={(startSec, endSec) => void confirmPendingClip(startSec, endSec)}
          onDiscard={discardPendingClip}
          onRerecord={pendingClip.source === 'webcam' ? rerecordPendingClip : undefined}
          onChooseAnotherFile={pendingClip.source === 'file' ? () => fileInputRef.current?.click() : undefined}
        />
      ) : (
        <>
          {isPreviewing && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(220px,0.85fr)] gap-3 items-start">
              {/* Preview + mic meter + record controls */}
              <div className="space-y-2 min-w-0">
                <div className="relative w-full overflow-hidden rounded-lg bg-black aspect-[4/3]">
                  <video
                    ref={liveVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-0"
                  />
                  <canvas
                    ref={previewCanvasRef}
                    className="absolute inset-0 h-full w-full object-contain bg-black"
                  />
                  {isRecording && (
                    <div className="pointer-events-none absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-md">
                      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      Rec {formatRecordingTime(recordingElapsed)}
                    </div>
                  )}
                </div>
                <div>
                  <div className="mb-0.5 flex items-center justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    <span>Microphone</span>
                    <span>Speak to test the mic</span>
                  </div>
                  <canvas
                    ref={waveformCanvasRef}
                    className="h-12 w-full rounded-md bg-slate-950"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white"
                    >
                      Stop recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      disabled={isSwitching}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white"
                    >
                      Start recording
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={cancelCamera}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    Cancel camera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isRecording}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200"
                  >
                    {isUploading ? 'Uploading…' : 'Upload video file'}
                  </button>
                </div>
              </div>

              {/* Collapsed-by-default camera / AV controls */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden min-w-0">
                <button
                  type="button"
                  aria-expanded={settingsExpanded}
                  onClick={() => {
                    const next = !settingsExpanded;
                    setSettingsExpanded(next);
                    storeFlag(SETTINGS_EXPANDED_KEY, next);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${settingsExpanded ? 'rotate-90' : ''}`}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">Camera &amp; settings</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {settingsExpanded
                        ? 'Hide device, quality, and look controls'
                        : 'Camera, mic, quality, and adjustments'}
                    </span>
                  </span>
                </button>
                {settingsExpanded && (
                  <div className="space-y-2 p-2.5 border-t border-slate-200 dark:border-slate-600 max-h-[min(28rem,55vh)] overflow-y-auto">
                    <div className="grid grid-cols-1 gap-2">
                      <label className="block">
                        <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                          Camera
                        </span>
                        <select
                          value={selectedCameraId}
                          disabled={deviceSelectsDisabled}
                          onChange={(e) => handleCameraChange(e.target.value)}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50"
                        >
                          {cameras.length === 0 && (
                            <option value={selectedCameraId || ''}>Default camera</option>
                          )}
                          {selectedCameraId && !cameras.some((device) => device.deviceId === selectedCameraId) && (
                            <option value={selectedCameraId}>Current camera</option>
                          )}
                          {cameras.map((device, index) => (
                            <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                              {deviceLabel(device, index, 'camera')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                          Microphone
                        </span>
                        <select
                          value={selectedMicId}
                          disabled={deviceSelectsDisabled}
                          onChange={(e) => handleMicChange(e.target.value)}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50"
                        >
                          {mics.length === 0 && (
                            <option value={selectedMicId || ''}>Default microphone</option>
                          )}
                          {selectedMicId && !mics.some((device) => device.deviceId === selectedMicId) && (
                            <option value={selectedMicId}>Current microphone</option>
                          )}
                          {mics.map((device, index) => (
                            <option key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                              {deviceLabel(device, index, 'mic')}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Quality &amp; compression
                      </span>
                      <select
                        value={quality}
                        disabled={deviceSelectsDisabled}
                        onChange={(e) => handleQualityChange(e.target.value as QualityId)}
                        className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50"
                      >
                        {(Object.keys(QUALITY_PRESETS) as QualityId[]).map((id) => (
                          <option key={id} value={id}>
                            {QUALITY_PRESETS[id].label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {QUALITY_PRESETS[quality].hint}
                      </p>
                    </label>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          className="accent-amber-600"
                          checked={mirror}
                          onChange={(e) => handleMirrorChange(e.target.checked)}
                        />
                        Mirror image
                      </label>
                      <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          className="accent-amber-600"
                          checked={noiseSuppression}
                          disabled={deviceSelectsDisabled}
                          onChange={(e) => handleNoiseSuppressionChange(e.target.checked)}
                        />
                        Noise suppression
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
                      <AvSlider
                        label="Brightness"
                        value={brightness}
                        min={0.5}
                        max={2}
                        onChange={updateBrightness}
                      />
                      <AvSlider
                        label="Contrast"
                        value={contrast}
                        min={0.5}
                        max={2}
                        onChange={updateContrast}
                      />
                      <AvSlider
                        label="Saturation"
                        value={saturation}
                        min={0.5}
                        max={2}
                        onChange={updateSaturation}
                      />
                      <AvSlider
                        label="Mic volume"
                        value={micGain}
                        min={0.5}
                        max={3}
                        onChange={updateMicGain}
                      />
                      <AvSlider
                        label="Zoom"
                        value={zoom}
                        min={1}
                        max={2.5}
                        step={0.05}
                        onChange={updateZoom}
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        <input
                          type="checkbox"
                          className="accent-amber-600"
                          checked={backgroundBlur}
                          disabled={blurLoading || !!brandBackgroundName}
                          onChange={(e) => void setBackgroundBlurEnabled(e.target.checked)}
                        />
                        Background blur
                        {blurLoading ? <span className="text-slate-400">Loading…</span> : null}
                      </label>
                    </div>
                    <AvSlider
                      label="Blur amount"
                      value={blurAmount}
                      min={4}
                      max={24}
                      step={1}
                      disabled={!backgroundBlur || blurLoading || !!brandBackgroundName}
                      formatValue={(value) => `${Math.round(value)}`}
                      onChange={updateBlurAmount}
                    />
                    <AvSlider
                      label="Ghost edge"
                      value={edgeChoke}
                      min={0}
                      max={10}
                      step={1}
                      disabled={(!backgroundBlur && !brandBackgroundName) || blurLoading}
                      formatValue={(value) => `${Math.round(value)}`}
                      onChange={updateEdgeChoke}
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Ghost edge: 0 keeps more hair; higher tightens the cutout and removes the outline.
                    </p>
                    <div className="space-y-1.5 rounded-md border border-slate-200 dark:border-slate-600 p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Brand background
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Upload a JPG or PNG (logo, office, or branded backdrop). It stays un-mirrored so text stays readable.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {brandBackgroundPreview ? (
                          <img
                            src={brandBackgroundPreview}
                            alt=""
                            className="h-12 w-20 rounded object-cover bg-slate-200 dark:bg-slate-700"
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => brandBgInputRef.current?.click()}
                          disabled={blurLoading}
                          className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                        >
                          {brandBackgroundName ? 'Replace image' : 'Upload JPG/PNG'}
                        </button>
                        {brandBackgroundName ? (
                          <button
                            type="button"
                            onClick={clearBrandBackground}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      {brandBackgroundName ? (
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{brandBackgroundName}</p>
                      ) : null}
                      <input
                        ref={brandBgInputRef}
                        type="file"
                        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => void handleBrandBackground(e.target.files?.[0])}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={resetAdjustments}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                    >
                      Reset adjustments
                    </button>
                    {lookNotBakedIn && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        Video look (brightness, contrast, saturation, background blur, brand background) may not be saved in this browser. Mic volume still applies.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {!isPreviewing && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startCamera()}
                disabled={isUploading || !canRecord}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white"
              >
                Record with webcam
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isRecording}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200"
              >
                {isUploading ? 'Uploading…' : 'Upload video file'}
              </button>
            </div>
          )}
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};
