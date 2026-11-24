import React, { useState } from 'react';
import { READ_ALOUD_RATES, type ReadAloudController, type ReadAloudRate } from '../hooks/useReadAloud';
import { openCopilotSummarize } from '../utils/openCopilotSummarize';
import { useToast } from './Toast';

/** Compact Microsoft Copilot mark (gradient spark) for the summarize action. */
const CopilotIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => {
  const gradId = React.useId().replace(/:/g, '');
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0FAFFF" />
          <stop offset="45%" stopColor="#9B6BFF" />
          <stop offset="100%" stopColor="#FF6BCB" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d="M12.2 2.4c.4-.9 1.7-.9 2.1 0l1.1 2.5c.2.4.5.7.9.9l2.5 1.1c.9.4.9 1.7 0 2.1l-2.5 1.1c-.4.2-.7.5-.9.9l-1.1 2.5c-.4.9-1.7.9-2.1 0l-1.1-2.5a1.8 1.8 0 00-.9-.9L7.7 9c-.9-.4-.9-1.7 0-2.1l2.5-1.1c.4-.2.7-.5.9-.9l1.1-2.5zM6.3 13.2c.3-.6 1.1-.6 1.4 0l.6 1.4c.1.3.3.5.6.6l1.4.6c.6.3.6 1.1 0 1.4l-1.4.6a1.2 1.2 0 00-.6.6l-.6 1.4c-.3.6-1.1.6-1.4 0l-.6-1.4a1.2 1.2 0 00-.6-.6l-1.4-.6c-.6-.3-.6-1.1 0-1.4l1.4-.6c.3-.1.5-.3.6-.6l.6-1.4zM17.6 15.1c.2-.5.9-.5 1.1 0l.4 1c.1.2.2.3.4.4l1 .4c.5.2.5.9 0 1.1l-1 .4a.7.7 0 00-.4.4l-.4 1c-.2.5-.9.5-1.1 0l-.4-1a.7.7 0 00-.4-.4l-1-.4c-.5-.2-.5-.9 0-1.1l1-.4c.2-.1.3-.2.4-.4l.4-1z"
      />
    </svg>
  );
};

type ReadAloudTheme = 'slate' | 'amber';

const THEME: Record<ReadAloudTheme, {
  iconIdle: string;
  iconActive: string;
  select: string;
  label: string;
}> = {
  slate: {
    iconIdle: 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200',
    iconActive: 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-100',
    select: 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-slate-400',
    label: 'text-slate-500 dark:text-slate-400',
  },
  amber: {
    iconIdle: 'hover:bg-amber-100 dark:hover:bg-amber-900/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200',
    iconActive: 'bg-amber-200 dark:bg-amber-800/70 text-amber-800 dark:text-amber-200',
    select: 'border-amber-200 dark:border-amber-800/80 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-amber-400',
    label: 'text-amber-700 dark:text-amber-300',
  },
};

interface ReadAloudButtonsProps {
  readAloud: ReadAloudController;
  theme?: ReadAloudTheme;
  /** When set, play/replay speak this text if non-empty; otherwise the full document. */
  resolveText?: () => string | undefined;
  /** Called just before speaking starts (e.g. capture selection highlight). */
  onBeforeSpeak?: () => void;
  /** Hide the replay button (compact toolbars). */
  hideReplay?: boolean;
}

export const ReadAloudButtons: React.FC<ReadAloudButtonsProps> = ({
  readAloud,
  theme = 'slate',
  resolveText,
  onBeforeSpeak,
  hideReplay = false,
}) => {
  const colors = THEME[theme];
  const toast = useToast();
  const { isSpeaking, playbackDisabled, toggle, replay, getText } = readAloud;
  const [copilotBusy, setCopilotBusy] = useState(false);

  const resolveOverride = () => {
    const text = resolveText?.()?.trim();
    return text || undefined;
  };

  /** Avoid stealing focus / collapsing selection before we read it. */
  const preserveSelection = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const speak = (fn: (override?: string) => void) => {
    onBeforeSpeak?.();
    fn(resolveOverride());
  };

  const summarizeWithCopilot = async () => {
    if (copilotBusy) return;
    const body = resolveOverride() || getText();
    setCopilotBusy(true);
    try {
      const result = await openCopilotSummarize(body);
      if (result === 'empty') {
        toast.info('Nothing to summarize');
        return;
      }
      if (result === 'truncated') {
        toast.info('Opened Copilot with a shortened prompt (full text on clipboard)');
        return;
      }
      if (result === 'clipboard_failed') {
        toast.success('Opened Copilot with your summarize prompt');
        return;
      }
      toast.success('Opened Copilot with your summarize prompt');
    } finally {
      setCopilotBusy(false);
    }
  };

  return (
    <>
      {isSpeaking && (
        <span
          className="ln-read-aloud-speaking-emoji"
          title="Reading aloud…"
          aria-live="polite"
          aria-label="Reading aloud"
        >
          🗣️
        </span>
      )}
      {!hideReplay && (
        <button
          type="button"
          onMouseDown={preserveSelection}
          onClick={() => speak(replay)}
          disabled={playbackDisabled}
          className={`p-1.5 rounded-lg transition-colors ${colors.iconIdle} disabled:opacity-40 disabled:cursor-not-allowed`}
          title="Replay"
          aria-label="Replay message aloud"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onMouseDown={preserveSelection}
        onClick={() => {
          if (isSpeaking) {
            toggle();
            return;
          }
          speak(toggle);
        }}
        disabled={playbackDisabled}
        className={`p-1.5 rounded-lg transition-colors ${
          isSpeaking ? colors.iconActive : colors.iconIdle
        } disabled:opacity-40 disabled:cursor-not-allowed`}
        title={isSpeaking ? 'Stop reading' : 'Read aloud'}
        aria-label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
        aria-pressed={isSpeaking}
      >
        {isSpeaking ? (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        )}
      </button>
      <button
        type="button"
        onMouseDown={preserveSelection}
        onClick={() => {
          void summarizeWithCopilot();
        }}
        disabled={copilotBusy}
        className={`p-1.5 rounded-lg transition-colors ${colors.iconIdle} disabled:opacity-40 disabled:cursor-not-allowed`}
        title="Summarize with Microsoft Copilot (opens Copilot with the prompt filled in)"
        aria-label="Summarize with Microsoft Copilot"
      >
        <CopilotIcon />
      </button>
    </>
  );
};

interface ReadAloudSpeedSelectProps {
  readAloud: ReadAloudController;
  id: string;
  theme?: ReadAloudTheme;
  compact?: boolean;
}

export const ReadAloudSpeedSelect: React.FC<ReadAloudSpeedSelectProps> = ({
  readAloud,
  id,
  theme = 'slate',
  compact = false,
}) => {
  const colors = THEME[theme];
  const { canSpeak, rate, setRate, playbackDisabled } = readAloud;

  if (!canSpeak) return null;

  return (
    <div className={`flex items-center gap-1.5 ${compact ? '' : 'mt-2.5'}`}>
      {!compact && (
        <label htmlFor={id} className={`text-[11px] font-semibold uppercase tracking-wider shrink-0 ${colors.label}`}>
          Speed
        </label>
      )}
      <select
        id={id}
        value={rate}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setRate(parseFloat(e.target.value) as ReadAloudRate)}
        disabled={playbackDisabled}
        className={`${compact ? 'w-[4.5rem]' : 'min-w-0 max-w-[8rem]'} rounded-lg border px-1.5 py-1 text-xs focus:outline-none focus:ring-2 disabled:opacity-50 ${colors.select}`}
        aria-label="Read aloud speed"
        title="Read aloud speed"
      >
        {READ_ALOUD_RATES.map((value) => (
          <option key={value} value={value}>
            {value === 1 ? '1×' : `${value}×`}
          </option>
        ))}
      </select>
    </div>
  );
};

interface ReadAloudOutputSelectProps {
  readAloud: ReadAloudController;
  id: string;
  theme?: ReadAloudTheme;
  compact?: boolean;
}

export const ReadAloudOutputSelect: React.FC<ReadAloudOutputSelectProps> = ({
  readAloud,
  id,
  theme = 'slate',
  compact = false,
}) => {
  const colors = THEME[theme];
  const {
    canSpeak,
    audioOutputs,
    selectedSinkId,
    audioOutputSupported,
    setAudioOutput,
    pickAudioOutput,
    refreshAudioOutputs,
  } = readAloud;

  if (!canSpeak || !audioOutputSupported) return null;

  const hasLabeledDevices = audioOutputs.some((d) => d.label && !/^Speaker \d+$/i.test(d.label));

  return (
    <div className={`flex items-center gap-1.5 ${compact ? '' : 'mt-2.5'}`}>
      {!compact && (
        <label htmlFor={id} className={`text-[11px] font-semibold uppercase tracking-wider shrink-0 ${colors.label}`}>
          Speaker
        </label>
      )}
      {hasLabeledDevices || audioOutputs.length > 0 ? (
        <select
          id={id}
          value={selectedSinkId}
          onMouseDown={(e) => {
            e.stopPropagation();
            void refreshAudioOutputs();
          }}
          onChange={(e) => {
            void setAudioOutput(e.target.value);
          }}
          className={`${compact ? 'max-w-[7.5rem]' : 'min-w-0 flex-1 max-w-full'} rounded-lg border px-1.5 py-1 text-xs focus:outline-none focus:ring-2 ${colors.select}`}
          aria-label="Read aloud speaker / headphones"
          title="Choose headphones or speakers. Selected device overrides system default for read-aloud."
        >
          <option value="">System default</option>
          {audioOutputs.map((device) => (
            <option key={device.deviceId || 'default'} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          void pickAudioOutput();
        }}
        className={`p-1.5 rounded-lg transition-colors shrink-0 ${colors.iconIdle}`}
        title="Pick headphones or speakers"
        aria-label="Pick audio output device"
      >
        <span aria-hidden>🎧</span>
      </button>
    </div>
  );
};

interface ReadAloudVoiceSelectProps {
  readAloud: ReadAloudController;
  id: string;
  theme?: ReadAloudTheme;
  compact?: boolean;
}

export const ReadAloudVoiceSelect: React.FC<ReadAloudVoiceSelectProps> = ({
  readAloud,
  id,
  theme = 'slate',
  compact = false,
}) => {
  const colors = THEME[theme];
  const {
    canSpeak,
    selectedVoiceUri,
    usVoices,
    femaleVoices,
    maleVoices,
    playbackDisabled,
    setVoice,
  } = readAloud;

  if (!canSpeak) return null;

  return (
    <div className={`flex items-center gap-1.5 ${compact ? '' : 'mt-2.5'}`}>
      {!compact && (
        <label htmlFor={id} className={`text-[11px] font-semibold uppercase tracking-wider shrink-0 ${colors.label}`}>
          Voice
        </label>
      )}
      <select
        id={id}
        value={selectedVoiceUri}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setVoice(e.target.value)}
        disabled={playbackDisabled || usVoices.length === 0}
        className={`${compact ? 'min-w-0 max-w-[10rem]' : 'min-w-0 flex-1 max-w-full'} rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-2 disabled:opacity-50 ${colors.select}`}
        aria-label="Select read aloud voice"
        title="Read aloud voice"
      >
        {usVoices.length > 0 ? (
          <>
            {femaleVoices.length > 0 && (
              <optgroup label="US Female">
                {femaleVoices.map(({ voice }) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} (Female)
                  </option>
                ))}
              </optgroup>
            )}
            {maleVoices.length > 0 && (
              <optgroup label="US Male">
                {maleVoices.map(({ voice }) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} (Male)
                  </option>
                ))}
              </optgroup>
            )}
          </>
        ) : (
          <option value="">Loading US voices...</option>
        )}
      </select>
    </div>
  );
};

const CHIP =
  'flex items-center gap-1 min-w-0 rounded-lg border px-1.5 py-0.5';
const CHIP_SELECT =
  'min-w-0 border-0 bg-transparent py-0.5 pl-0 pr-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-0 disabled:opacity-50';

interface ReadAloudSettingsRowProps {
  readAloud: ReadAloudController;
  idPrefix: string;
  className?: string;
}

/** One compact row: voice / speed / speaker with mild colors + emoji. */
export const ReadAloudSettingsRow: React.FC<ReadAloudSettingsRowProps> = ({
  readAloud,
  idPrefix,
  className = '',
}) => {
  const {
    canSpeak,
    selectedVoiceUri,
    usVoices,
    femaleVoices,
    maleVoices,
    playbackDisabled,
    setVoice,
    rate,
    setRate,
    audioOutputs,
    selectedSinkId,
    audioOutputSupported,
    setAudioOutput,
    pickAudioOutput,
    refreshAudioOutputs,
  } = readAloud;

  if (!canSpeak) return null;

  const voiceId = `${idPrefix}-voice`;
  const speedId = `${idPrefix}-speed`;
  const outputId = `${idPrefix}-output`;
  const hasLabeledDevices = audioOutputs.some((d) => d.label && !/^Speaker \d+$/i.test(d.label));

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={`${CHIP} flex-[1.4] bg-sky-50/90 border-sky-100 dark:bg-sky-950/35 dark:border-sky-900/50`}
        title="Voice"
      >
        <label htmlFor={voiceId} className="text-sm leading-none shrink-0 cursor-default" aria-hidden>
          🗣️
        </label>
        <select
          id={voiceId}
          value={selectedVoiceUri}
          onChange={(e) => setVoice(e.target.value)}
          disabled={playbackDisabled || usVoices.length === 0}
          className={`${CHIP_SELECT} flex-1`}
          aria-label="Read aloud voice"
        >
          {usVoices.length > 0 ? (
            <>
              {femaleVoices.length > 0 && (
                <optgroup label="US Female">
                  {femaleVoices.map(({ voice }) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} (Female)
                    </option>
                  ))}
                </optgroup>
              )}
              {maleVoices.length > 0 && (
                <optgroup label="US Male">
                  {maleVoices.map(({ voice }) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} (Male)
                    </option>
                  ))}
                </optgroup>
              )}
            </>
          ) : (
            <option value="">Loading…</option>
          )}
        </select>
      </div>

      <div
        className={`${CHIP} shrink-0 bg-amber-50/90 border-amber-100 dark:bg-amber-950/35 dark:border-amber-900/50`}
        title="Speed"
      >
        <label htmlFor={speedId} className="text-sm leading-none shrink-0 cursor-default" aria-hidden>
          ⚡
        </label>
        <select
          id={speedId}
          value={rate}
          onChange={(e) => setRate(parseFloat(e.target.value) as ReadAloudRate)}
          disabled={playbackDisabled}
          className={`${CHIP_SELECT} w-[3.25rem]`}
          aria-label="Read aloud speed"
        >
          {READ_ALOUD_RATES.map((value) => (
            <option key={value} value={value}>
              {value === 1 ? '1×' : `${value}×`}
            </option>
          ))}
        </select>
      </div>

      {audioOutputSupported && (
        <div
          className={`${CHIP} flex-1 bg-emerald-50/90 border-emerald-100 dark:bg-emerald-950/35 dark:border-emerald-900/50`}
          title="Speaker / headphones"
        >
          <span className="text-sm leading-none shrink-0" aria-hidden>
            🔊
          </span>
          {(hasLabeledDevices || audioOutputs.length > 0) && (
            <select
              id={outputId}
              value={selectedSinkId}
              onMouseDown={() => {
                void refreshAudioOutputs();
              }}
              onChange={(e) => {
                void setAudioOutput(e.target.value);
              }}
              className={`${CHIP_SELECT} flex-1`}
              aria-label="Read aloud speaker / headphones"
            >
              <option value="">System default</option>
              {audioOutputs.map((device) => (
                <option key={device.deviceId || 'default'} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void pickAudioOutput();
            }}
            className="p-0.5 rounded-md shrink-0 text-sm leading-none hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 transition-colors"
            title="Pick headphones or speakers"
            aria-label="Pick audio output device"
          >
            🎧
          </button>
        </div>
      )}
    </div>
  );
};
