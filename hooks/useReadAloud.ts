import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const VOICE_STORAGE_KEY = 'linknest_readaloud_voice';
const LEGACY_VOICE_STORAGE_KEY = 'linknest_maintenance_readaloud_voice';
const VOICE_USER_CHOSEN_KEY = 'linknest_readaloud_voice_user_chosen';
const RATE_STORAGE_KEY = 'linknest_readaloud_rate';
const SINK_STORAGE_KEY = 'linknest_readaloud_sink';

export const READ_ALOUD_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type ReadAloudRate = (typeof READ_ALOUD_RATES)[number];

export type AudioOutputDevice = {
  deviceId: string;
  label: string;
};

function readStoredRate(): ReadAloudRate {
  try {
    const raw = parseFloat(localStorage.getItem(RATE_STORAGE_KEY) || '');
    if (READ_ALOUD_RATES.includes(raw as ReadAloudRate)) return raw as ReadAloudRate;
  } catch {
    // Ignore storage failures
  }
  return 1;
}

function persistRate(rate: ReadAloudRate): void {
  try {
    localStorage.setItem(RATE_STORAGE_KEY, String(rate));
  } catch {
    // Ignore storage failures
  }
}

function readStoredSinkId(): string {
  try {
    return localStorage.getItem(SINK_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function persistSinkId(deviceId: string): void {
  try {
    if (!deviceId) localStorage.removeItem(SINK_STORAGE_KEY);
    else localStorage.setItem(SINK_STORAGE_KEY, deviceId);
  } catch {
    // Ignore storage failures
  }
}

/** Best-effort route page audio to a chosen output (SpeechSynthesis cannot setSinkId). */
async function applyAudioSinkId(deviceId: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype) {
      const ctx = new AudioContext(deviceId ? ({ sinkId: deviceId } as AudioContextOptions) : undefined);
      if (deviceId && typeof (ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function') {
        await (ctx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      }
      // Brief silent buffer so the sink is actually engaged on some browsers.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
      await ctx.close();
      return true;
    }
  } catch {
    // Fall through
  }
  return false;
}

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

export type SpeakProgress = {
  charIndex: number;
  charLength: number;
  text: string;
};

export function useReadAloud({ text, active = true, autoStart = false }: UseReadAloudOptions) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakProgress, setSpeakProgress] = useState<SpeakProgress | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(readStoredVoiceUri);
  const [rate, setRateState] = useState<ReadAloudRate>(readStoredRate);
  const [audioOutputs, setAudioOutputs] = useState<AudioOutputDevice[]>([]);
  const [selectedSinkId, setSelectedSinkIdState] = useState<string>(readStoredSinkId);
  const [audioOutputSupported, setAudioOutputSupported] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const keepAliveRef = useRef<number | null>(null);
  const speakTimeoutRef = useRef<number | null>(null);
  const progressFallbackRef = useRef<number | null>(null);
  const boundarySeenRef = useRef(false);
  const speakGenerationRef = useRef(0);
  const autoStartedRef = useRef(false);
  const ownsSpeechRef = useRef(false);
  const selectedVoiceUriRef = useRef(selectedVoiceUri);
  const rateRef = useRef(rate);
  const textRef = useRef(text);
  const lastSpokenTextRef = useRef('');
  selectedVoiceUriRef.current = selectedVoiceUri;
  rateRef.current = rate;
  textRef.current = text;

  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const usVoices = useMemo(() => getUsMaleFemaleVoices(voices), [voices]);
  const femaleVoices = useMemo(() => usVoices.filter((option) => option.gender === 'female'), [usVoices]);
  const maleVoices = useMemo(() => usVoices.filter((option) => option.gender === 'male'), [usVoices]);
  const playbackDisabled = !canSpeak || !text.trim();

  const clearProgressTimers = useCallback(() => {
    if (progressFallbackRef.current != null) {
      window.clearInterval(progressFallbackRef.current);
      progressFallbackRef.current = null;
    }
  }, []);

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
    clearProgressTimers();
    utteranceRef.current = null;
    const shouldCancel = ownsSpeechRef.current;
    ownsSpeechRef.current = false;
    if (shouldCancel && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakProgress(null);
    setIsSpeaking(false);
  }, [clearProgressTimers]);

  const start = useCallback((overrideText?: string) => {
    const speakable = (overrideText?.trim() || textRef.current).trim();
    if (!canSpeak || !speakable) return;
    lastSpokenTextRef.current = speakable;
    boundarySeenRef.current = false;
    setSpeakProgress({ charIndex: 0, charLength: 1, text: speakable });

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
    clearProgressTimers();
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
      utterance.rate = rateRef.current;
      utterance.pitch = 1;
      utterance.volume = 1;
      if (preferredVoice) {
        utterance.voice = preferredVoice;
        utterance.lang = preferredVoice.lang;
      }

      const finish = () => {
        if (speakGenerationRef.current !== generation) return;
        if (keepAliveRef.current != null) {
          window.clearInterval(keepAliveRef.current);
          keepAliveRef.current = null;
        }
        clearProgressTimers();
        utteranceRef.current = null;
        ownsSpeechRef.current = false;
        setSpeakProgress(null);
        setIsSpeaking(false);
      };

      utterance.onboundary = (event) => {
        if (speakGenerationRef.current !== generation) return;
        if (event.name && event.name !== 'word' && event.name !== 'sentence') return;
        boundarySeenRef.current = true;
        const charIndex = typeof event.charIndex === 'number' ? event.charIndex : 0;
        const charLength =
          typeof (event as SpeechSynthesisEvent & { charLength?: number }).charLength === 'number'
            ? (event as SpeechSynthesisEvent & { charLength: number }).charLength
            : Math.min(12, Math.max(1, speakable.length - charIndex));
        setSpeakProgress({ charIndex, charLength, text: speakable });
      };

      utterance.onend = finish;
      utterance.onerror = (event) => {
        if (event.error === 'interrupted' || event.error === 'canceled') return;
        finish();
      };

      utteranceRef.current = utterance;
      ownsSpeechRef.current = true;
      window.speechSynthesis.speak(utterance);

      // Fallback trail when the engine does not fire boundary events (e.g. some voices).
      const cps = Math.max(8, 14 * rateRef.current);
      progressFallbackRef.current = window.setInterval(() => {
        if (speakGenerationRef.current !== generation) return;
        if (boundarySeenRef.current) return;
        if (!window.speechSynthesis.speaking) return;
        setSpeakProgress((prev) => {
          const base = prev?.text || speakable;
          const next = Math.min(base.length, (prev?.charIndex || 0) + Math.max(1, Math.round(cps / 4)));
          const remaining = base.slice(next).match(/^\S+/)?.[0]?.length || 1;
          return { charIndex: next, charLength: remaining, text: base };
        });
      }, 250);

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
  }, [canSpeak, clearProgressTimers, usVoices]);

  const refreshAudioOutputs = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setAudioOutputSupported(false);
      return;
    }
    setAudioOutputSupported(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices
        .filter((d) => d.kind === 'audiooutput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === 'default' || d.deviceId === '' ? 'System default' : `Speaker ${index + 1}`),
        }));
      setAudioOutputs(outputs);
    } catch {
      setAudioOutputs([]);
    }
  }, []);

  const setAudioOutput = useCallback(
    async (deviceId: string) => {
      setSelectedSinkIdState(deviceId);
      persistSinkId(deviceId);
      await applyAudioSinkId(deviceId);
      await refreshAudioOutputs();
    },
    [refreshAudioOutputs]
  );

  const pickAudioOutput = useCallback(async () => {
    const md = navigator.mediaDevices as MediaDevices & {
      selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
    };
    if (typeof md?.selectAudioOutput === 'function') {
      try {
        const device = await md.selectAudioOutput(
          selectedSinkId ? { deviceId: selectedSinkId } : undefined
        );
        await setAudioOutput(device.deviceId);
        return;
      } catch {
        // User cancelled or unsupported
      }
    }
    await refreshAudioOutputs();
  }, [refreshAudioOutputs, selectedSinkId, setAudioOutput]);

  const startWithSink = useCallback(
    async (overrideText?: string) => {
      const sink = selectedSinkId || readStoredSinkId();
      if (sink) await applyAudioSinkId(sink);
      start(overrideText);
    },
    [selectedSinkId, start]
  );

  useEffect(() => {
    void refreshAudioOutputs();
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return;
    const onChange = () => {
      void refreshAudioOutputs();
    };
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, [refreshAudioOutputs]);

  const toggle = useCallback((overrideText?: string) => {
    if (isSpeaking) {
      stop();
      return;
    }
    void startWithSink(overrideText);
  }, [isSpeaking, startWithSink, stop]);

  const replay = useCallback((overrideText?: string) => {
    void startWithSink(overrideText);
  }, [startWithSink]);

  const setVoice = useCallback(
    (uri: string) => {
      setSelectedVoiceUri(uri);
      selectedVoiceUriRef.current = uri;
      persistVoiceUri(uri);
      if (isSpeaking) void startWithSink(lastSpokenTextRef.current || undefined);
    },
    [isSpeaking, startWithSink]
  );

  const setRate = useCallback(
    (next: ReadAloudRate) => {
      setRateState(next);
      rateRef.current = next;
      persistRate(next);
      if (isSpeaking) void startWithSink(lastSpokenTextRef.current || undefined);
    },
    [isSpeaking, startWithSink]
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
      void startWithSink();
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
  }, [active, autoStart, playbackDisabled, usVoices.length, startWithSink, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    canSpeak,
    isSpeaking,
    speakProgress,
    selectedVoiceUri,
    rate,
    audioOutputs,
    selectedSinkId,
    audioOutputSupported,
    usVoices,
    femaleVoices,
    maleVoices,
    playbackDisabled,
    start,
    stop,
    toggle,
    replay,
    setVoice,
    setRate,
    setAudioOutput,
    pickAudioOutput,
    refreshAudioOutputs,
  };
}

export type ReadAloudController = ReturnType<typeof useReadAloud>;
