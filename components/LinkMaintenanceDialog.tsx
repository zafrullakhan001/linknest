import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { linkifyHtml } from '../utils/richTextDisplay';

interface LinkMaintenanceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  linkLabel: string;
  linkIcon?: string;
  maintenanceMessage?: string;
  maintenanceVideoUrl?: string;
}

function stripHtmlTags(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') return content.replace(/<[^>]*>/g, '');
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return tempDiv.textContent || tempDiv.innerText || '';
}

const DEFAULT_MAINTENANCE_TEXT = 'This link is under a maintenance window and is temporarily unavailable.';
const VOICE_STORAGE_KEY = 'linknest_maintenance_readaloud_voice';

const US_MALE_NAME_HINTS = new Set([
  'andrew', 'brian', 'brandon', 'bruce', 'christopher', 'claude', 'daniel', 'david',
  'davis', 'eric', 'fred', 'george', 'guy', 'james', 'jason', 'john', 'junior',
  'mark', 'matthew', 'michael', 'noah', 'ralph', 'richard', 'robert', 'roger',
  'ryan', 'steffan', 'stephen', 'thomas', 'tom', 'tony', 'william', 'alex',
]);

const US_FEMALE_NAME_HINTS = new Set([
  'amber', 'amy', 'ana', 'anna', 'aria', 'ashley', 'ava', 'cora', 'elizabeth',
  'ella', 'emily', 'emma', 'eva', 'hazel', 'ivy', 'jane', 'jenny', 'joanna',
  'karen', 'kathy', 'kendra', 'kimberly', 'lily', 'lisa', 'lucy', 'maria',
  'mary', 'michelle', 'nancy', 'olivia', 'princess', 'rachel', 'salli', 'samantha',
  'sara', 'sarah', 'sophia', 'stella', 'susan', 'vicki', 'victoria', 'zira', 'zoey',
]);

type UsVoiceGender = 'male' | 'female';

function readStoredVoiceUri(): string {
  try {
    return localStorage.getItem(VOICE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function persistVoiceUri(uri: string): void {
  try {
    if (uri) localStorage.setItem(VOICE_STORAGE_KEY, uri);
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
}

function isUsEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  const lang = (voice.lang || '').toLowerCase().replace('_', '-');
  const name = (voice.name || '').toLowerCase();
  if (lang === 'en-us' || lang.startsWith('en-us-')) return true;
  if (name.includes('united states') || name.includes('us english')) return true;
  return false;
}

function extractVoiceGivenName(name: string): string {
  return name
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(microsoft|google|apple|online|natural|desktop|english|united states|us english|premium|neural|multilingual|enhanced)\b/gi, ' ')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')[0]
    ?.toLowerCase() || '';
}

function getUsVoiceGender(voice: SpeechSynthesisVoice): UsVoiceGender | null {
  const name = (voice.name || '').toLowerCase();
  if (/\bfemale\b/.test(name)) return 'female';
  if (/\bmale\b/.test(name)) return 'male';
  // Chrome's bundled "Google US English" voice is female.
  if (name.includes('google us english')) return 'female';

  const givenName = extractVoiceGivenName(voice.name || '');
  if (givenName && US_FEMALE_NAME_HINTS.has(givenName)) return 'female';
  if (givenName && US_MALE_NAME_HINTS.has(givenName)) return 'male';
  return null;
}

type UsVoiceOption = {
  voice: SpeechSynthesisVoice;
  gender: UsVoiceGender;
};

function getUsMaleFemaleVoices(list: SpeechSynthesisVoice[]): UsVoiceOption[] {
  return list
    .filter(isUsEnglishVoice)
    .map((voice) => {
      const gender = getUsVoiceGender(voice);
      return gender ? { voice, gender } : null;
    })
    .filter((option): option is UsVoiceOption => !!option)
    .sort((a, b) => {
      if (a.gender !== b.gender) return a.gender === 'female' ? -1 : 1;
      return a.voice.name.localeCompare(b.voice.name);
    });
}

export const LinkMaintenanceDialog: React.FC<LinkMaintenanceDialogProps> = ({
  isOpen,
  onClose,
  linkLabel,
  linkIcon,
  maintenanceMessage,
  maintenanceVideoUrl,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(readStoredVoiceUri);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const speakTimeoutRef = useRef<number | null>(null);
  const speakGenerationRef = useRef(0);
  const autoStartedForOpenRef = useRef(false);
  const selectedVoiceUriRef = useRef(selectedVoiceUri);
  selectedVoiceUriRef.current = selectedVoiceUri;

  const plainLabel = useMemo(() => stripHtmlTags(linkLabel || ''), [linkLabel]);
  const displayHtml = useMemo(() => linkifyHtml(maintenanceMessage || ''), [maintenanceMessage]);
  const speakableText = useMemo(() => {
    const fromMessage = stripHtmlTags(maintenanceMessage || '').replace(/\s+/g, ' ').trim();
    return fromMessage || DEFAULT_MAINTENANCE_TEXT;
  }, [maintenanceMessage]);
  const hasMessage = !!stripHtmlTags(maintenanceMessage || '').trim();
  const hasVideo = !!maintenanceVideoUrl?.trim();
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const usVoices = useMemo(() => getUsMaleFemaleVoices(voices), [voices]);
  const femaleVoices = useMemo(() => usVoices.filter((option) => option.gender === 'female'), [usVoices]);
  const maleVoices = useMemo(() => usVoices.filter((option) => option.gender === 'male'), [usVoices]);

  const stopSpeaking = useCallback(() => {
    speakGenerationRef.current += 1;
    if (speakTimeoutRef.current != null) {
      window.clearTimeout(speakTimeoutRef.current);
      speakTimeoutRef.current = null;
    }
    if (keepAliveRef.current != null) {
      window.clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    utteranceRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const startSpeaking = useCallback(() => {
    if (!canSpeak || !speakableText) return;

    const generation = speakGenerationRef.current + 1;
    speakGenerationRef.current = generation;
    if (speakTimeoutRef.current != null) {
      window.clearTimeout(speakTimeoutRef.current);
      speakTimeoutRef.current = null;
    }
    if (keepAliveRef.current != null) {
      window.clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }

    const begin = () => {
      if (speakGenerationRef.current !== generation) return;

      const availableUsVoices = (usVoices.length > 0 ? usVoices : getUsMaleFemaleVoices(window.speechSynthesis.getVoices()))
        .map((option) => option.voice);
      const selectedUri = selectedVoiceUriRef.current;
      const preferredVoice =
        availableUsVoices.find((voice) => voice.voiceURI === selectedUri) ||
        availableUsVoices.find((voice) => voice.default) ||
        availableUsVoices[0];

      const utterance = new SpeechSynthesisUtterance(speakableText);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang;
      }

      utterance.onend = () => {
        if (speakGenerationRef.current !== generation) return;
        if (keepAliveRef.current != null) {
          window.clearInterval(keepAliveRef.current);
          keepAliveRef.current = null;
        }
        utteranceRef.current = null;
        setIsSpeaking(false);
      };
      utterance.onerror = (event) => {
        if (event.error === 'interrupted' || event.error === 'canceled') return;
        if (speakGenerationRef.current !== generation) return;
        if (keepAliveRef.current != null) {
          window.clearInterval(keepAliveRef.current);
          keepAliveRef.current = null;
        }
        utteranceRef.current = null;
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);

      // Chrome can silently stop long utterances; nudge it while still speaking.
      keepAliveRef.current = window.setInterval(() => {
        if (speakGenerationRef.current !== generation) return;
        if (!window.speechSynthesis.speaking) return;
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }, 10000);
    };

    setIsSpeaking(true);
    speakTimeoutRef.current = window.setTimeout(begin, 40);
  }, [canSpeak, speakableText, usVoices]);

  const toggleReadAloud = useCallback(() => {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    startSpeaking();
  }, [isSpeaking, startSpeaking, stopSpeaking]);

  const replayReadAloud = useCallback(() => {
    startSpeaking();
  }, [startSpeaking]);

  const handleVoiceChange = useCallback(
    (uri: string) => {
      setSelectedVoiceUri(uri);
      selectedVoiceUriRef.current = uri;
      persistVoiceUri(uri);
      if (isSpeaking) {
        startSpeaking();
      }
    },
    [isSpeaking, startSpeaking]
  );

  useEffect(() => {
    if (selectedVoiceUri) persistVoiceUri(selectedVoiceUri);
  }, [selectedVoiceUri]);

  useEffect(() => {
    if (!canSpeak) return;

    const applyVoices = (list: SpeechSynthesisVoice[]) => {
      const usList = getUsMaleFemaleVoices(list);
      setVoices(list);
      if (usList.length === 0) return;
      setSelectedVoiceUri((prev) => {
        if (prev && usList.some((option) => option.voice.voiceURI === prev)) return prev;
        const saved = readStoredVoiceUri();
        if (saved && usList.some((option) => option.voice.voiceURI === saved)) return saved;
        const fallback =
          usList.find((option) => option.voice.default) ||
          usList.find((option) => option.gender === 'female') ||
          usList[0];
        return fallback?.voice.voiceURI || prev;
      });
    };

    const loadVoices = () => applyVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [canSpeak]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      autoStartedForOpenRef.current = false;
      stopSpeaking();
      return;
    }
    if (hasVideo || !canSpeak || !speakableText) return;

    let cancelled = false;
    const tryStart = () => {
      if (cancelled || autoStartedForOpenRef.current) return;
      autoStartedForOpenRef.current = true;
      startSpeaking();
    };

    if (usVoices.length > 0) {
      tryStart();
      return () => {
        cancelled = true;
      };
    }

    const fallback = window.setTimeout(tryStart, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [isOpen, hasVideo, canSpeak, speakableText, usVoices, startSpeaking, stopSpeaking]);

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  if (!isOpen || typeof document === 'undefined') return null;

  const playbackDisabled = !canSpeak || !speakableText;

  return createPortal(
    <div className="fixed inset-0 z-[99999]" role="presentation">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="link-maintenance-dialog-title"
          className="pointer-events-auto w-full max-w-2xl max-h-[min(640px,calc(100vh-2rem))] flex flex-col overflow-hidden rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="shrink-0 px-5 py-3.5 border-b border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/60 text-xl" aria-hidden>
                  {linkIcon || '🔧'}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    Under maintenance
                  </p>
                  <h2
                    id="link-maintenance-dialog-title"
                    className="text-base font-semibold text-slate-900 dark:text-white truncate"
                    title={plainLabel}
                  >
                    {plainLabel || 'This link'}
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={replayReadAloud}
                  disabled={playbackDisabled}
                  className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Replay"
                  aria-label="Replay message aloud"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={toggleReadAloud}
                  disabled={playbackDisabled}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isSpeaking
                      ? 'bg-amber-200 dark:bg-amber-800/70 text-amber-800 dark:text-amber-200'
                      : 'hover:bg-amber-100 dark:hover:bg-amber-900/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={isSpeaking ? 'Stop reading' : 'Read message aloud'}
                  aria-label={isSpeaking ? 'Stop reading message aloud' : 'Read message aloud'}
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
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="Close"
                  aria-label="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {canSpeak && (
              <div className="mt-2.5 flex items-center gap-2">
                <label htmlFor="link-maintenance-voice" className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 shrink-0">
                  Voice
                </label>
                <select
                  id="link-maintenance-voice"
                  value={selectedVoiceUri}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  disabled={playbackDisabled || usVoices.length === 0}
                  className="min-w-0 flex-1 max-w-full rounded-lg border border-amber-200 dark:border-amber-800/80 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50"
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
            )}
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 px-5 py-4 space-y-4">
            {hasVideo && (
              <video
                src={maintenanceVideoUrl}
                controls
                playsInline
                className="w-full max-h-72 rounded-lg bg-black"
              />
            )}
            {hasMessage ? (
              <div
                className="link-info-viewer ln-tinymce-content text-slate-700 dark:text-slate-200"
                dangerouslySetInnerHTML={{ __html: displayHtml }}
              />
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {DEFAULT_MAINTENANCE_TEXT}
              </p>
            )}
          </div>

          <div className="shrink-0 px-5 py-3 border-t border-amber-200 dark:border-amber-800/60 bg-white dark:bg-slate-800 flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
