import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const VOICE_STORAGE_KEY = 'linknest_readaloud_voice';
const LEGACY_VOICE_STORAGE_KEY = 'linknest_maintenance_readaloud_voice';
const VOICE_USER_CHOSEN_KEY = 'linknest_readaloud_voice_user_chosen';

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

export type UsVoiceGender = 'male' | 'female';

export type UsVoiceOption = {
  voice: SpeechSynthesisVoice;
  gender: UsVoiceGender;
};

function hasUserChosenVoice(): boolean {
  try {
    return localStorage.getItem(VOICE_USER_CHOSEN_KEY) === '1';
  } catch {
    return false;
  }
}

function readStoredVoiceUri(): string {
  try {
    // Honor a stored URI only after the user explicitly picked a voice.
    if (!hasUserChosenVoice()) return '';
    return localStorage.getItem(VOICE_STORAGE_KEY) || localStorage.getItem(LEGACY_VOICE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function persistVoiceUri(uri: string): void {
  try {
    if (!uri) return;
    localStorage.setItem(VOICE_STORAGE_KEY, uri);
    localStorage.setItem(VOICE_USER_CHOSEN_KEY, '1');
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
  if (name.includes('google us english')) return 'female';

  const givenName = extractVoiceGivenName(voice.name || '');
  if (givenName && US_FEMALE_NAME_HINTS.has(givenName)) return 'female';
  if (givenName && US_MALE_NAME_HINTS.has(givenName)) return 'male';
  return null;
}

export function getUsMaleFemaleVoices(list: SpeechSynthesisVoice[]): UsVoiceOption[] {
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

function isEmmaVoice(voice: SpeechSynthesisVoice): boolean {
  const name = (voice.name || '').toLowerCase();
  return /\bemma\b/.test(name) || extractVoiceGivenName(voice.name || '') === 'emma';
}

function pickDefaultUsVoice(usList: UsVoiceOption[]): UsVoiceOption | undefined {
  return (
    usList.find((option) => isEmmaVoice(option.voice)) ||
    usList.find((option) => option.gender === 'female') ||
    usList.find((option) => option.voice.default) ||
    usList[0]
  );
}

export function toSpeakableText(content: string): string {
  if (!content) return '';
  if (typeof document === 'undefined') {
    return content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = content;
  return (tempDiv.textContent || tempDiv.innerText || '').replace(/\s+/g, ' ').trim();
}

interface UseReadAloudOptions {
  text: string;
  active?: boolean;
  autoStart?: boolean;
}

export function useReadAloud({ text, active = true, autoStart = false }: UseReadAloudOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(readStoredVoiceUri);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const speakTimeoutRef = useRef<number | null>(null);
  const speakGenerationRef = useRef(0);
  const autoStartedRef = useRef(false);
  const ownsSpeechRef = useRef(false);
  const selectedVoiceUriRef = useRef(selectedVoiceUri);
  const textRef = useRef(text);
  selectedVoiceUriRef.current = selectedVoiceUri;
  textRef.current = text;

  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const usVoices = useMemo(() => getUsMaleFemaleVoices(voices), [voices]);
  const femaleVoices = useMemo(() => usVoices.filter((option) => option.gender === 'female'), [usVoices]);
  const maleVoices = useMemo(() => usVoices.filter((option) => option.gender === 'male'), [usVoices]);
  const playbackDisabled = !canSpeak || !text.trim();

  const stop = useCallback(() => {
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
    const shouldCancel = ownsSpeechRef.current;
    ownsSpeechRef.current = false;
    if (shouldCancel && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const start = useCallback(() => {
    const speakable = textRef.current.trim();
    if (!canSpeak || !speakable) return;

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
        availableUsVoices.find(isEmmaVoice) ||
        availableUsVoices[0];

      const utterance = new SpeechSynthesisUtterance(speakable);
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
        ownsSpeechRef.current = false;
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
        ownsSpeechRef.current = false;
        setIsSpeaking(false);
      };

      utteranceRef.current = utterance;
      ownsSpeechRef.current = true;
      window.speechSynthesis.speak(utterance);

      keepAliveRef.current = window.setInterval(() => {
        if (speakGenerationRef.current !== generation) return;
        if (!window.speechSynthesis.speaking) return;
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }, 10000);
    };

    ownsSpeechRef.current = true;
    setIsSpeaking(true);
    speakTimeoutRef.current = window.setTimeout(begin, 40);
  }, [canSpeak, usVoices]);

  const toggle = useCallback(() => {
    if (isSpeaking) {
      stop();
      return;
    }
    start();
  }, [isSpeaking, start, stop]);

  const replay = useCallback(() => {
    start();
  }, [start]);

  const setVoice = useCallback(
    (uri: string) => {
      setSelectedVoiceUri(uri);
      selectedVoiceUriRef.current = uri;
      persistVoiceUri(uri);
      if (isSpeaking) start();
    },
    [isSpeaking, start]
  );

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
        return pickDefaultUsVoice(usList)?.voice.voiceURI || prev;
      });
    };

    const loadVoices = () => applyVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [canSpeak]);

  useEffect(() => {
    if (!active) {
      autoStartedRef.current = false;
      stop();
      return;
    }
    if (!autoStart || playbackDisabled) return;

    let cancelled = false;
    const tryStart = () => {
      if (cancelled || autoStartedRef.current) return;
      autoStartedRef.current = true;
      start();
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
  }, [active, autoStart, playbackDisabled, usVoices.length, start, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    canSpeak,
    isSpeaking,
    selectedVoiceUri,
    usVoices,
    femaleVoices,
    maleVoices,
    playbackDisabled,
    start,
    stop,
    toggle,
    replay,
    setVoice,
  };
}

export type ReadAloudController = ReturnType<typeof useReadAloud>;
