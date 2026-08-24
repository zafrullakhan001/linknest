import React, { useRef, useState } from 'react';
import { LinkMaintenanceVideoField } from './LinkMaintenanceVideoField';
import { uploadLinkMaintenanceVideo } from '../services/storageService';
import { isYouTubeUrl, toYouTubeThumbnailUrl } from '../utils/youtube';

export type SpaceVideoSource = 'youtube' | 'file' | 'webcam';

interface SpaceVideoFieldProps {
  source: SpaceVideoSource;
  url: string;
  onSourceChange: (source: SpaceVideoSource) => void;
  onUrlChange: (url: string) => void;
}

const MAX_BYTES = 50 * 1024 * 1024;

export const SpaceVideoField: React.FC<SpaceVideoFieldProps> = ({
  source,
  url,
  onSourceChange,
  onUrlChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const youtubeOk = source === 'youtube' && !!url.trim() && isYouTubeUrl(url);
  const thumb = youtubeOk ? toYouTubeThumbnailUrl(url) : null;

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|ogv|ogg|mov)$/i.test(file.name)) {
      setError('Please choose a video file (MP4, WebM, etc.).');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Video is too large. Maximum size is 50MB.');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadLinkMaintenanceVideo(file, file.name);
      onSourceChange('file');
      onUrlChange(uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload video');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Video source</label>
        <div className="space-y-2">
          <label className={`flex items-center gap-2.5 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${source === 'youtube' ? 'border-rose-300 bg-rose-50/80 dark:border-rose-800 dark:bg-rose-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-white/70 dark:hover:bg-slate-800/50'}`}>
            <input
              type="radio"
              name="spaceVideoSource"
              checked={source === 'youtube'}
              onChange={() => {
                onSourceChange('youtube');
                if (url && !isYouTubeUrl(url)) onUrlChange('');
              }}
              className="w-4 h-4 text-rose-600 focus:ring-rose-500 focus:ring-2"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              <span aria-hidden="true">▶️</span> YouTube — paste a YouTube link
            </span>
          </label>
          <label className={`flex items-center gap-2.5 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${source === 'file' ? 'border-violet-300 bg-violet-50/80 dark:border-violet-800 dark:bg-violet-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-white/70 dark:hover:bg-slate-800/50'}`}>
            <input
              type="radio"
              name="spaceVideoSource"
              checked={source === 'file'}
              onChange={() => {
                onSourceChange('file');
                if (url && isYouTubeUrl(url)) onUrlChange('');
              }}
              className="w-4 h-4 text-violet-600 focus:ring-violet-500 focus:ring-2"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              <span aria-hidden="true">📁</span> Video file — upload MP4 / WebM (up to 50MB)
            </span>
          </label>
          <label className={`flex items-center gap-2.5 cursor-pointer rounded-lg border px-3 py-2.5 transition-colors ${source === 'webcam' ? 'border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-700 hover:bg-white/70 dark:hover:bg-slate-800/50'}`}>
            <input
              type="radio"
              name="spaceVideoSource"
              checked={source === 'webcam'}
              onChange={() => {
                onSourceChange('webcam');
                if (url && isYouTubeUrl(url)) onUrlChange('');
              }}
              className="w-4 h-4 text-amber-600 focus:ring-amber-500 focus:ring-2"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              <span aria-hidden="true">📷</span> Webcam — record with your camera
            </span>
          </label>
        </div>
      </div>

      {source === 'youtube' ? (
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">YouTube URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setError(null);
              onUrlChange(e.target.value);
            }}
            placeholder="https://www.youtube.com/watch?v=… or https://youtu.be/…"
            className="w-full bg-white/80 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500 placeholder-slate-400 transition-all"
          />
          {url.trim() && !youtubeOk && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">Enter a valid YouTube watch, share, or Shorts URL.</p>
          )}
          {thumb && (
            <div className="mt-3 relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video max-w-md">
              <img src={thumb} alt="YouTube thumbnail" className="w-full h-full object-cover opacity-90" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600/95 text-white shadow-lg" aria-hidden>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 ml-0.5">
                    <path d="M8 5.14v14l11-7-11-7z" />
                  </svg>
                </span>
              </div>
            </div>
          )}
        </div>
      ) : source === 'webcam' ? (
        <LinkMaintenanceVideoField
          value={url}
          onChange={onUrlChange}
          allowFileUpload={false}
          heading="Webcam recording"
          description="Record a clip with your webcam (WebM / MP4, up to 50MB)."
        />
      ) : (
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Video file</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,.mp4,.webm,.ogv,.ogg,.mov"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 hover:bg-violet-100 dark:hover:bg-violet-900/50 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : (url ? 'Replace video' : 'Upload video')}
            </button>
            {url ? (
              <button
                type="button"
                onClick={() => onUrlChange('')}
                className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
              >
                Remove
              </button>
            ) : null}
          </div>
          {url ? (
            <video
              src={url}
              controls
              playsInline
              className="mt-3 w-full max-w-md max-h-56 rounded-xl bg-black border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Choose a video file to play inside LinkNest.</p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
    </div>
  );
};
