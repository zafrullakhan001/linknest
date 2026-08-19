import React, { useCallback, useEffect, useRef, useState } from 'react';
import { uploadLinkMaintenanceVideo } from '../services/storageService';

interface LinkMaintenanceVideoFieldProps {
  value?: string;
  onChange: (url: string) => void;
}

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

export const LinkMaintenanceVideoField: React.FC<LinkMaintenanceVideoFieldProps> = ({
  value,
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    stopStream();
  }, [stopStream]);

  const startCamera = async () => {
    setError(null);
    if (!canRecord) {
      setError('Camera recording is not available in this browser. You can still upload a video file.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setIsPreviewing(true);
      requestAnimationFrame(() => {
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          void liveVideoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setError('Could not access the webcam. Check camera permissions, or upload a video file instead.');
    }
  };

  const cancelCamera = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setIsPreviewing(false);
    stopStream();
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    setError(null);
    chunksRef.current = [];
    try {
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType
        ? new MediaRecorder(streamRef.current, { mimeType })
        : new MediaRecorder(streamRef.current);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setError('Recording failed. Try uploading a video file instead.');
        setIsRecording(false);
      };
      recorder.start();
      setIsRecording(true);
    } catch {
      setError('Recording is not supported in this browser. Upload a video file instead.');
    }
  };

  const stopAndUpload = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.onstop = async () => {
      setIsRecording(false);
      const mime = recorder.mimeType || pickRecorderMimeType() || 'video/webm';
      const blob = new Blob(chunksRef.current, { type: mime.split(';')[0] });
      chunksRef.current = [];
      recorderRef.current = null;
      setIsPreviewing(false);
      stopStream();
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
            <video
              ref={liveVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full max-h-52 rounded-lg bg-black"
            />
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
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white"
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
