import React, { useCallback, useEffect, useRef, useState } from 'react';
import { uploadLinkMaintenanceVideo } from '../services/storageService';

interface LinkMaintenanceVideoFieldProps {
  value?: string;
  onChange: (url: string) => void;
}

const CAMERA_STORAGE_KEY = 'linknest.maintenanceVideo.cameraId';
const MIC_STORAGE_KEY = 'linknest.maintenanceVideo.micId';
const DEFAULT_BRIGHTNESS = 1;
const DEFAULT_CONTRAST = 1;
const DEFAULT_SATURATION = 1;
const DEFAULT_MIC_GAIN = 1;

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function extensionForMime(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogv';
  return 'webm';
}

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
  mode: 'exact' | 'ideal'
): MediaStreamConstraints {
  const video: boolean | MediaTrackConstraints = cameraId
    ? { deviceId: mode === 'exact' ? { exact: cameraId } : { ideal: cameraId } }
    : true;
  const audio: boolean | MediaTrackConstraints = micId
    ? { deviceId: mode === 'exact' ? { exact: micId } : { ideal: micId } }
    : true;
  return { video, audio };
}

async function acquireStream(cameraId: string, micId: string): Promise<MediaStream> {
  const tryGet = (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints);
  if (cameraId || micId) {
    try {
      return await tryGet(buildConstraints(cameraId, micId, 'exact'));
    } catch {
      try {
        return await tryGet(buildConstraints(cameraId, micId, 'ideal'));
      } catch {
        /* fall through to defaults */
      }
    }
  }
  try {
    return await tryGet({ video: true, audio: true });
  } catch {
    return await tryGet({ video: true, audio: false });
  }
}

function trackDeviceId(track: MediaStreamTrack | undefined): string {
  if (!track) return '';
  try {
    return track.getSettings().deviceId || '';
  } catch {
    return '';
  }
}

const AvSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step = 0.05, onChange }) => (
  <label className="block">
    <div className="mb-0.5 flex justify-between text-[11px] font-medium text-slate-600 dark:text-slate-400">
      <span>{label}</span>
      <span>{value.toFixed(1)}×</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-amber-600"
    />
  </label>
);

export const LinkMaintenanceVideoField: React.FC<LinkMaintenanceVideoFieldProps> = ({
  value,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const drawRafRef = useRef<number>(0);
  const pipelineGenRef = useRef(0);
  const selectedCameraIdRef = useRef('');
  const selectedMicIdRef = useRef('');
  const brightnessRef = useRef(DEFAULT_BRIGHTNESS);
  const contrastRef = useRef(DEFAULT_CONTRAST);
  const saturationRef = useRef(DEFAULT_SATURATION);
  const micGainRef = useRef(DEFAULT_MIC_GAIN);
  const isRecordingRef = useRef(false);

  const [isPreviewing, setIsPreviewing] = useState(false);
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
    sourceNodeRef.current = null;
    gainNodeRef.current = null;
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
        if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        if (canvas.width > 0 && canvas.height > 0) {
          try {
            ctx.filter = `brightness(${brightnessRef.current}) contrast(${contrastRef.current}) saturate(${saturationRef.current})`;
          } catch {
            ctx.filter = 'none';
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
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
        const canvasStream = canvas.captureStream(30);
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
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(gain);
        gain.connect(dest);
        sourceNodeRef.current = source;
        gainNodeRef.current = gain;
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
        readStoredDeviceId(MIC_STORAGE_KEY)
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
      const stream = await acquireStream(selectedCameraIdRef.current, selectedMicIdRef.current);
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
      const recorder = mimeType
        ? new MediaRecorder(recordStream, { mimeType })
        : new MediaRecorder(recordStream);
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

  const stopAndUpload = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.onstop = async () => {
      isRecordingRef.current = false;
      setIsRecording(false);
      const mime = recorder.mimeType || pickRecorderMimeType() || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] });
      chunksRef.current = [];
      recorderRef.current = null;
      setIsPreviewing(false);
      setLookNotBakedIn(false);
      teardownProcessing();
      if (blob.size < 1) {
        setError('Recording was empty. Please try again.');
        return;
      }
      setIsUploading(true);
      setError(null);
      try {
        const url = await uploadLinkMaintenanceVideo(blob, `recording.${extensionForMime(mime)}`);
        onChange(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload recording');
      } finally {
        setIsUploading(false);
      }
    };
    recorder.stop();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('Please choose a video file.');
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const url = await uploadLinkMaintenanceVideo(file, file.name);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload video');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

  const resetAdjustments = () => {
    updateBrightness(DEFAULT_BRIGHTNESS);
    updateContrast(DEFAULT_CONTRAST);
    updateSaturation(DEFAULT_SATURATION);
    updateMicGain(DEFAULT_MIC_GAIN);
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
      ) : (
        <>
          {isPreviewing && (
            <div className="space-y-2">
              <div className="relative w-full overflow-hidden rounded-lg bg-black">
                <video
                  ref={liveVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-0"
                />
                <canvas
                  ref={previewCanvasRef}
                  className="relative w-full max-h-52 bg-black"
                />
              </div>
              <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-600 p-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                    Video look (brightness, contrast, saturation) may not be saved in this browser. Mic volume still applies.
                  </p>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!isPreviewing ? (
              <button
                type="button"
                onClick={() => void startCamera()}
                disabled={isUploading || !canRecord}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white"
              >
                Record with webcam
              </button>
            ) : isRecording ? (
              <button
                type="button"
                onClick={stopAndUpload}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white"
              >
                Stop &amp; upload
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
            {isPreviewing && (
              <button
                type="button"
                onClick={cancelCamera}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
              >
                Cancel camera
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isRecording}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 text-slate-700 dark:text-slate-200"
            >
              {isUploading ? 'Uploading…' : 'Upload video file'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
          </div>
        </>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};
