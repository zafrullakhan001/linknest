import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API dictation for search inputs.
 *
 * Only Chromium + Safari expose SpeechRecognition, and it is prefixed as
 * webkitSpeechRecognition on both. `supported` is false everywhere else so
 * callers can hide the mic button instead of showing a dead control.
 */
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseVoiceSearchResult {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
  error: string | null;
}

/**
 * @param onTranscript Called with the recognised text (interim results merged
 *                     into a single final string when the engine settles).
 */
export function useVoiceSearch(onTranscript: (text: string) => void): UseVoiceSearchResult {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;

  const supported = getRecognitionCtor() !== null;

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    // Restart cleanly if a previous session is still open.
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }

    const recognition = new Ctor();
    recognition.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    setError(null);

    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i += 1) {
        text += event.results[i][0].transcript;
      }
      transcriptRef.current(text.trim());
    };
    recognition.onerror = (event: any) => {
      const code = String(event?.error || 'unknown');
      // 'no-speech' / 'aborted' are normal user outcomes, not failures.
      if (code !== 'no-speech' && code !== 'aborted') setError(code);
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start voice input');
      setListening(false);
    }
  }, []);

  // Never leave the mic hot if the component unmounts mid-dictation.
  useEffect(() => () => {
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
  }, []);

  return { supported, listening, start, stop, error };
}

export default useVoiceSearch;
