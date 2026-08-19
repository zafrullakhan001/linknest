import React from 'react';
import type { ReadAloudController } from '../hooks/useReadAloud';

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
}

export const ReadAloudButtons: React.FC<ReadAloudButtonsProps> = ({
  readAloud,
  theme = 'slate',
}) => {
  const colors = THEME[theme];
  const { isSpeaking, playbackDisabled, toggle, replay } = readAloud;

  return (
    <>
      <button
        type="button"
        onClick={replay}
        disabled={playbackDisabled}
        className={`p-1.5 rounded-lg transition-colors ${colors.iconIdle} disabled:opacity-40 disabled:cursor-not-allowed`}
        title="Replay"
        aria-label="Replay message aloud"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
        </svg>
      </button>
      <button
        type="button"
        onClick={toggle}
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
    </>
  );
};

interface ReadAloudVoiceSelectProps {
  readAloud: ReadAloudController;
  id: string;
  theme?: ReadAloudTheme;
}

export const ReadAloudVoiceSelect: React.FC<ReadAloudVoiceSelectProps> = ({
  readAloud,
  id,
  theme = 'slate',
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
    <div className="mt-2.5 flex items-center gap-2">
      <label htmlFor={id} className={`text-[11px] font-semibold uppercase tracking-wider shrink-0 ${colors.label}`}>
        Voice
      </label>
      <select
        id={id}
        value={selectedVoiceUri}
        onChange={(e) => setVoice(e.target.value)}
        disabled={playbackDisabled || usVoices.length === 0}
        className={`min-w-0 flex-1 max-w-full rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 disabled:opacity-50 ${colors.select}`}
        aria-label="Select read aloud voice"
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
