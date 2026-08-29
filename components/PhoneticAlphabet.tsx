import React, { useState, useRef, useEffect } from 'react';
import { isEscapeDialogOpen } from '../hooks/useEscapeToClose';

interface PhoneticEntry {
  letter: string;
  words: string[];
}

const phoneticAlphabets: Record<string, PhoneticEntry[]> = {
  usa: [
    { letter: 'A', words: ['Alpha', 'Apple', 'Able'] },
    { letter: 'B', words: ['Bravo', 'Baker', 'Boy'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Delta', 'Dog', 'Day'] },
    { letter: 'E', words: ['Echo', 'Easy', 'Egg'] },
    { letter: 'F', words: ['Foxtrot', 'Fox', 'Fish'] },
    { letter: 'G', words: ['Golf', 'Girl', 'Game'] },
    { letter: 'H', words: ['Hotel', 'House', 'Hat'] },
    { letter: 'I', words: ['India', 'Ice', 'Ink'] },
    { letter: 'J', words: ['Juliet', 'Jump', 'Jam'] },
    { letter: 'K', words: ['Kilo', 'King', 'Key'] },
    { letter: 'L', words: ['Lima', 'Love', 'Lake'] },
    { letter: 'M', words: ['Mike', 'Moon', 'Man'] },
    { letter: 'N', words: ['November', 'Night', 'Nose'] },
    { letter: 'O', words: ['Oscar', 'Orange', 'Open'] },
    { letter: 'P', words: ['Papa', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Quebec', 'Queen', 'Quick'] },
    { letter: 'R', words: ['Romeo', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sierra', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tango', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uniform', 'Up', 'Use'] },
    { letter: 'V', words: ['Victor', 'Van', 'Vase'] },
    { letter: 'W', words: ['Whiskey', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yankee', 'Yes', 'Yellow'] },
    { letter: 'Z', words: ['Zulu', 'Zip', 'Zone'] },
  ],
  uk: [
    { letter: 'A', words: ['Apple', 'Able', 'Arm'] },
    { letter: 'B', words: ['Beer', 'Boy', 'Book'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Don', 'Dog', 'Day'] },
    { letter: 'E', words: ['Edward', 'Egg', 'Ear'] },
    { letter: 'F', words: ['Freddie', 'Fish', 'Fox'] },
    { letter: 'G', words: ['George', 'Girl', 'Game'] },
    { letter: 'H', words: ['Harry', 'Hat', 'House'] },
    { letter: 'I', words: ['Ink', 'Ice', 'In'] },
    { letter: 'J', words: ['Johnnie', 'Jump', 'Jam'] },
    { letter: 'K', words: ['King', 'Key', 'Kit'] },
    { letter: 'L', words: ['London', 'Love', 'Lake'] },
    { letter: 'M', words: ['Monkey', 'Moon', 'Man'] },
    { letter: 'N', words: ['Nuts', 'Night', 'Nose'] },
    { letter: 'O', words: ['Orange', 'Open', 'Oak'] },
    { letter: 'P', words: ['Pip', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Queen', 'Quick', 'Quiet'] },
    { letter: 'R', words: ['Robert', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sugar', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tommy', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uncle', 'Up', 'Use'] },
    { letter: 'V', words: ['Vic', 'Van', 'Vase'] },
    { letter: 'W', words: ['William', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yellow', 'Yes', 'Year'] },
    { letter: 'Z', words: ['Zebra', 'Zip', 'Zone'] },
  ],
  nato: [
    { letter: 'A', words: ['Alfa', 'Apple', 'Able'] },
    { letter: 'B', words: ['Bravo', 'Baker', 'Boy'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Delta', 'Dog', 'Day'] },
    { letter: 'E', words: ['Echo', 'Easy', 'Egg'] },
    { letter: 'F', words: ['Foxtrot', 'Fox', 'Fish'] },
    { letter: 'G', words: ['Golf', 'Girl', 'Game'] },
    { letter: 'H', words: ['Hotel', 'House', 'Hat'] },
    { letter: 'I', words: ['India', 'Ice', 'Ink'] },
    { letter: 'J', words: ['Juliett', 'Jump', 'Jam'] },
    { letter: 'K', words: ['Kilo', 'King', 'Key'] },
    { letter: 'L', words: ['Lima', 'Love', 'Lake'] },
    { letter: 'M', words: ['Mike', 'Moon', 'Man'] },
    { letter: 'N', words: ['November', 'Night', 'Nose'] },
    { letter: 'O', words: ['Oscar', 'Orange', 'Open'] },
    { letter: 'P', words: ['Papa', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Quebec', 'Queen', 'Quick'] },
    { letter: 'R', words: ['Romeo', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sierra', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tango', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uniform', 'Up', 'Use'] },
    { letter: 'V', words: ['Victor', 'Van', 'Vase'] },
    { letter: 'W', words: ['Whiskey', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yankee', 'Yes', 'Yellow'] },
    { letter: 'Z', words: ['Zulu', 'Zip', 'Zone'] },
  ],
  canada: [
    { letter: 'A', words: ['Alfa', 'Apple', 'Able'] },
    { letter: 'B', words: ['Bravo', 'Baker', 'Boy'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Delta', 'Dog', 'Day'] },
    { letter: 'E', words: ['Echo', 'Easy', 'Egg'] },
    { letter: 'F', words: ['Foxtrot', 'Fox', 'Fish'] },
    { letter: 'G', words: ['Golf', 'Girl', 'Game'] },
    { letter: 'H', words: ['Hotel', 'House', 'Hat'] },
    { letter: 'I', words: ['India', 'Ice', 'Ink'] },
    { letter: 'J', words: ['Juliet', 'Jump', 'Jam'] },
    { letter: 'K', words: ['Kilo', 'King', 'Key'] },
    { letter: 'L', words: ['Lima', 'Love', 'Lake'] },
    { letter: 'M', words: ['Mike', 'Moon', 'Man'] },
    { letter: 'N', words: ['November', 'Night', 'Nose'] },
    { letter: 'O', words: ['Oscar', 'Orange', 'Open'] },
    { letter: 'P', words: ['Papa', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Quebec', 'Queen', 'Quick'] },
    { letter: 'R', words: ['Romeo', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sierra', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tango', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uniform', 'Up', 'Use'] },
    { letter: 'V', words: ['Victor', 'Van', 'Vase'] },
    { letter: 'W', words: ['Whiskey', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yankee', 'Yes', 'Yellow'] },
    { letter: 'Z', words: ['Zulu', 'Zip', 'Zone'] },
  ],
  australia: [
    { letter: 'A', words: ['Alpha', 'Apple', 'Able'] },
    { letter: 'B', words: ['Bravo', 'Baker', 'Boy'] },
    { letter: 'C', words: ['Charlie', 'Cat', 'Car'] },
    { letter: 'D', words: ['Delta', 'Dog', 'Day'] },
    { letter: 'E', words: ['Echo', 'Easy', 'Egg'] },
    { letter: 'F', words: ['Foxtrot', 'Fox', 'Fish'] },
    { letter: 'G', words: ['Golf', 'Girl', 'Game'] },
    { letter: 'H', words: ['Hotel', 'House', 'Hat'] },
    { letter: 'I', words: ['India', 'Ice', 'Ink'] },
    { letter: 'J', words: ['Juliet', 'Jump', 'Jam'] },
    { letter: 'K', words: ['Kilo', 'King', 'Key'] },
    { letter: 'L', words: ['Lima', 'Love', 'Lake'] },
    { letter: 'M', words: ['Mike', 'Moon', 'Man'] },
    { letter: 'N', words: ['November', 'Night', 'Nose'] },
    { letter: 'O', words: ['Oscar', 'Orange', 'Open'] },
    { letter: 'P', words: ['Papa', 'Park', 'Pen'] },
    { letter: 'Q', words: ['Quebec', 'Queen', 'Quick'] },
    { letter: 'R', words: ['Romeo', 'Red', 'Rain'] },
    { letter: 'S', words: ['Sierra', 'Sun', 'Star'] },
    { letter: 'T', words: ['Tango', 'Tree', 'Time'] },
    { letter: 'U', words: ['Uniform', 'Up', 'Use'] },
    { letter: 'V', words: ['Victor', 'Van', 'Vase'] },
    { letter: 'W', words: ['Whiskey', 'Water', 'Wind'] },
    { letter: 'X', words: ['X-ray', 'Box', 'Fix'] },
    { letter: 'Y', words: ['Yankee', 'Yes', 'Yellow'] },
    { letter: 'Z', words: ['Zulu', 'Zip', 'Zone'] },
  ],
};

const countryNames: Record<string, string> = {
  usa: 'USA',
  uk: 'UK',
  nato: 'NATO',
  canada: 'Canada',
  australia: 'Australia',
};

const RATE_STORAGE_KEY = 'linknest_phonetic_speech_rate';
const VOLUME_STORAGE_KEY = 'linknest_phonetic_speech_volume';
const NAME_PAUSE_MS = 450;

/** Split names on comma/semicolon first (keeps "John Smith"); otherwise on spaces. */
function parseReadAloudNames(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (/[,;]/.test(trimmed)) {
    return trimmed.split(/[,;]+/).map((part) => part.trim()).filter(Boolean);
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

function readStoredNumber(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = parseFloat(localStorage.getItem(key) || '');
    if (Number.isFinite(raw)) return Math.min(max, Math.max(min, raw));
  } catch {
    // Ignore storage failures
  }
  return fallback;
}

interface PhoneticAlphabetProps {
  onClose?: () => void;
}

export const PhoneticAlphabet: React.FC<PhoneticAlphabetProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<string>('usa');
  const [viewMode, setViewMode] = useState<'chart' | 'converter' | 'readaloud'>('chart');
  const [inputText, setInputText] = useState<string>('');

  // Escape key handler to close widget
  useEffect(() => {
    if (!onClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey) {
        if (isEscapeDialogOpen()) return;
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose]);
  const [copied, setCopied] = useState<boolean>(false);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('linknest_phonetic_selected_voice');
      return saved || '';
    } catch {
      return '';
    }
  });
  const [isReading, setIsReading] = useState<boolean>(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(() =>
    readStoredNumber(RATE_STORAGE_KEY, 1, 0.5, 2)
  );
  const [speechVolume, setSpeechVolume] = useState<number>(() =>
    readStoredNumber(VOLUME_STORAGE_KEY, 1, 0, 1)
  );
  const cancelledRef = useRef(false);
  const nextTimerRef = useRef<number | null>(null);

  const currentAlphabet = phoneticAlphabets[activeTab] || phoneticAlphabets.usa;
  const readAloudNames = parseReadAloudNames(inputText);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // If no voice selected and voices are available, select default
      if (!selectedVoiceUri && availableVoices.length > 0) {
        const defaultVoice = availableVoices.find(v => v.default) || availableVoices[0];
        if (defaultVoice) {
          setSelectedVoiceUri(defaultVoice.voiceURI);
          localStorage.setItem('linknest_phonetic_selected_voice', defaultVoice.voiceURI);
        }
      }
    };

    loadVoices();
    // Some browsers load voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (window.speechSynthesis.onvoiceschanged) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [selectedVoiceUri]);

  // Save selected voice to localStorage
  useEffect(() => {
    if (selectedVoiceUri) {
      try {
        localStorage.setItem('linknest_phonetic_selected_voice', selectedVoiceUri);
      } catch (error) {
        console.error('Failed to save voice selection:', error);
      }
    }
  }, [selectedVoiceUri]);

  useEffect(() => {
    try {
      localStorage.setItem(RATE_STORAGE_KEY, String(speechRate));
    } catch {
      // Ignore storage failures
    }
  }, [speechRate]);

  useEffect(() => {
    try {
      localStorage.setItem(VOLUME_STORAGE_KEY, String(speechVolume));
    } catch {
      // Ignore storage failures
    }
  }, [speechVolume]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (nextTimerRef.current) {
        window.clearTimeout(nextTimerRef.current);
        nextTimerRef.current = null;
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  // Filter voices for English (US and UK)
  const englishVoices = voices.filter(voice => 
    voice.lang.startsWith('en-US') || voice.lang.startsWith('en-GB')
  );

  // Create a map for quick lookup (all words for each letter)
  const alphabetMap = new Map(
    currentAlphabet.map((entry) => [entry.letter, entry.words])
  );

  // Get set of characters from input text (uppercase, only letters) - for highlighting
  const inputChars = new Set(
    inputText
      .toUpperCase()
      .split('')
      .filter((char) => /[A-Z]/.test(char))
  );

  // Convert text to phonetic alphabet
  const convertToPhonetic = (text: string): Array<{ char: string; phonetic: string }> => {
    return text
      .toUpperCase()
      .split('')
      .map((char) => {
        if (/[A-Z]/.test(char)) {
          const words = alphabetMap.get(char) || [];
          return {
            char,
            phonetic: words.join(' | '),
          };
        }
        return {
          char,
          phonetic: char === ' ' ? ' ' : char,
        };
      });
  };

  const phoneticText = convertToPhonetic(inputText);

  const clearInput = () => {
    stopAudio();
    setInputText('');
  };

  // Copy to clipboard function
  const copyToClipboard = async () => {
    if (!inputText.trim()) return;

    const phoneticLines = phoneticText
      .filter(item => item.char !== ' ')
      .map(item => {
        if (/[A-Z]/.test(item.char)) {
          return `${item.char} | ${item.phonetic}`;
        }
        return item.char;
      })
      .join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(phoneticLines);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = phoneticLines;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // Audio playback function
  const playPhoneticWord = (word: string, index: number) => {
    // Stop any currently playing audio
    window.speechSynthesis.cancel();
    
    setPlayingIndex(index);
    
    // Use the first word if multiple words are separated by pipes
    const wordToSpeak = word.split(' | ')[0];
    
    const utterance = new SpeechSynthesisUtterance(wordToSpeak);
    utterance.rate = 0.8;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      setPlayingIndex(null);
    };

    utterance.onerror = () => {
      setPlayingIndex(null);
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopAudio = () => {
    cancelledRef.current = true;
    if (nextTimerRef.current) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    window.speechSynthesis.cancel();
    setPlayingIndex(null);
    setIsReading(false);
    setSpeakingIndex(null);
  };

  // Get selected voice object
  const getSelectedVoice = (): SpeechSynthesisVoice | null => {
    const availableVoices = voices.length > 0 ? voices : window.speechSynthesis.getVoices();
    
    if (!selectedVoiceUri) {
      return availableVoices.find(voice => voice.default) || availableVoices[0] || null;
    }
    
    const voice = availableVoices.find(v => v.voiceURI === selectedVoiceUri);
    return voice || availableVoices.find(voice => voice.default) || availableVoices[0] || null;
  };

  // Read aloud function — speaks each parsed name in sequence
  const readAloud = () => {
    const names = parseReadAloudNames(inputText);
    if (names.length === 0) return;

    cancelledRef.current = false;
    if (nextTimerRef.current) {
      window.clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsReading(true);

    const voice = getSelectedVoice();
    const rate = speechRate;
    const volume = speechVolume;

    const speakAt = (index: number) => {
      if (cancelledRef.current) return;
      if (index >= names.length) {
        setIsReading(false);
        setSpeakingIndex(null);
        return;
      }

      setSpeakingIndex(index);
      const utterance = new SpeechSynthesisUtterance(names[index]);
      if (voice) {
        utterance.voice = voice;
      }
      utterance.rate = rate;
      utterance.pitch = 1.0;
      utterance.volume = volume;

      utterance.onend = () => {
        if (cancelledRef.current) return;
        if (index + 1 >= names.length) {
          setIsReading(false);
          setSpeakingIndex(null);
          return;
        }
        nextTimerRef.current = window.setTimeout(() => speakAt(index + 1), NAME_PAUSE_MS);
      };

      utterance.onerror = () => {
        if (cancelledRef.current) return;
        setIsReading(false);
        setSpeakingIndex(null);
      };

      window.speechSynthesis.speak(utterance);
    };

    speakAt(0);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 h-full flex flex-col min-w-0">
      <div className="mb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Phonetic Alphabet
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
              title="Close Phonetic Alphabet Widget"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
        {/* View Mode Tabs */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => setViewMode('chart')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              viewMode === 'chart'
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            Chart
          </button>
          <button
            onClick={() => setViewMode('converter')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              viewMode === 'converter'
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            Converter
          </button>
          <button
            onClick={() => setViewMode('readaloud')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              viewMode === 'readaloud'
                ? 'bg-brand-500 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            Read Aloud
          </button>
        </div>
        {/* Text Input Field */}
        <div className="mb-3 relative">
          {viewMode === 'readaloud' ? (
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (!isReading && inputText.trim()) readAloud();
                }
              }}
              placeholder="Enter names separated by comma, semicolon, or space..."
              rows={2}
              className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y min-h-[2.5rem]"
            />
          ) : (
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                viewMode === 'chart'
                  ? 'Enter text to highlight letters...'
                  : 'Enter text to convert to phonetic...'
              }
              className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
          {inputText && (
            <button
              onClick={clearInput}
              className={`absolute right-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded transition-colors ${
                viewMode === 'readaloud' ? 'top-2' : 'top-1/2 -translate-y-1/2'
              }`}
              title="Clear text"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          )}
        </div>
        {/* Country Tabs - only show in chart mode */}
        {viewMode === 'chart' && (
          <div className="flex flex-wrap gap-1 mb-3">
            {Object.keys(phoneticAlphabets).map((key) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === key
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {countryNames[key]}
              </button>
            ))}
          </div>
        )}
        {/* Country Tabs - show in converter mode too */}
        {viewMode === 'converter' && (
          <div className="flex flex-wrap gap-1 mb-3">
            {Object.keys(phoneticAlphabets).map((key) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  activeTab === key
                    ? 'bg-brand-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {countryNames[key]}
              </button>
            ))}
          </div>
        )}
        {/* Voice, speed, and volume - show in readaloud mode */}
        {viewMode === 'readaloud' && (
          <div className="mb-3 space-y-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Voice
              </label>
              <select
                value={selectedVoiceUri}
                onChange={(e) => setSelectedVoiceUri(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {englishVoices.length > 0 ? (
                  englishVoices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))
                ) : (
                  <option value="">Loading voices...</option>
                )}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="phonetic-speech-rate" className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  <span>Speed</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">{speechRate.toFixed(2)}×</span>
                </label>
                <input
                  id="phonetic-speech-rate"
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="w-full accent-brand-500"
                  aria-label="Read aloud speed"
                  title="Read aloud speed"
                />
              </div>
              <div>
                <label htmlFor="phonetic-speech-volume" className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  <span>Volume</span>
                  <span className="tabular-nums text-slate-500 dark:text-slate-400">{Math.round(speechVolume * 100)}%</span>
                </label>
                <input
                  id="phonetic-speech-volume"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={speechVolume}
                  onChange={(e) => setSpeechVolume(parseFloat(e.target.value))}
                  className="w-full accent-brand-500"
                  aria-label="Read aloud volume"
                  title="Read aloud volume"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {viewMode === 'chart' ? (
        /* Alphabet Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto flex-1 min-h-0">
          {currentAlphabet.map((entry) => {
            const isHighlighted = inputChars.has(entry.letter);
            return (
              <div
                key={entry.letter}
                className={`rounded p-2 border transition-colors flex items-center gap-3 ${
                  isHighlighted
                    ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 hover:bg-orange-200 dark:hover:bg-orange-900/50'
                    : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex-shrink-0">
                  {entry.letter}
                </div>
                <div className="space-y-0.5 flex-1">
                  {entry.words.map((word, index) => (
                    <div
                      key={index}
                      className="text-xs text-slate-600 dark:text-slate-400 font-medium"
                    >
                      {word}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'converter' ? (
        /* Phonetic Text Converter */
        <div className="overflow-y-auto flex-1 min-h-0">
          {inputText.trim() ? (
            <>
              {/* Copy and Audio Controls */}
              <div className="flex gap-2 mb-3 pb-2 border-b border-slate-200 dark:border-slate-700">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 px-3 py-1.5 text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white rounded transition-colors flex items-center justify-center gap-1"
                  title="Copy phonetic text to clipboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    {copied ? (
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    ) : (
                      <>
                        <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
                        <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
                      </>
                    )}
                  </svg>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                {playingIndex !== null && (
                  <button
                    onClick={stopAudio}
                    className="px-3 py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex items-center justify-center gap-1"
                    title="Stop audio"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                      <path d="M5.25 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 006.75 3h-1.5zM11.25 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                    </svg>
                    Stop
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {phoneticText.map((item, index) => {
                  if (item.char === ' ') {
                    return (
                      <div key={index} className="h-4"></div>
                    );
                  }
                  if (!/[A-Z]/.test(item.char)) {
                    return (
                      <div key={index} className="flex items-center gap-3 p-2 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50">
                        <div className="text-lg font-bold text-slate-400 dark:text-slate-500 flex-shrink-0">
                          {item.char}
                        </div>
                      </div>
                    );
                  }
                  const isPlaying = playingIndex === index;
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-2 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex-shrink-0 min-w-[2rem]">
                        {item.char}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                        |
                      </div>
                      <div className="text-sm font-medium text-slate-700 dark:text-slate-300 flex-1">
                        {item.phonetic}
                      </div>
                      <button
                        onClick={() => playPhoneticWord(item.phonetic, index)}
                        disabled={isPlaying}
                        className={`p-1.5 rounded transition-colors flex-shrink-0 ${
                          isPlaying
                            ? 'bg-brand-500 text-white'
                            : 'text-slate-500 dark:text-slate-400 hover:text-brand-500 dark:hover:text-brand-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                        title="Play pronunciation"
                      >
                        {isPlaying ? (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M5.25 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 006.75 3h-1.5zM11.25 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm">
              Enter text above to convert to phonetic alphabet
            </div>
          )}
        </div>
      ) : (
        /* Read Aloud */
        <div className="overflow-y-auto flex-1 min-h-0">
          {readAloudNames.length > 0 ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={readAloud}
                  disabled={isReading}
                  className={`flex-1 px-4 py-2 text-sm font-medium rounded transition-colors flex items-center justify-center gap-2 ${
                    isReading
                      ? 'bg-slate-400 dark:bg-slate-600 text-white cursor-not-allowed'
                      : 'bg-brand-500 hover:bg-brand-600 text-white'
                  }`}
                  title={readAloudNames.length === 1 ? 'Read name aloud' : `Read ${readAloudNames.length} names aloud`}
                >
                  {isReading ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 animate-pulse">
                        <path d="M5.25 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 006.75 3h-1.5zM11.25 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                      </svg>
                      {speakingIndex !== null
                        ? `Reading ${speakingIndex + 1} of ${readAloudNames.length}…`
                        : 'Reading...'}
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                      {readAloudNames.length === 1 ? 'Read Aloud' : `Read ${readAloudNames.length} Names`}
                    </>
                  )}
                </button>
                {isReading && (
                  <button
                    onClick={stopAudio}
                    className="px-4 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded transition-colors flex items-center justify-center gap-2"
                    title="Stop reading"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M5.25 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 006.75 3h-1.5zM11.25 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                    </svg>
                    Stop
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Separate names with commas, semicolons, or spaces. Use commas to keep first and last names together.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {readAloudNames.map((name, index) => {
                  const isSpeaking = speakingIndex === index;
                  return (
                    <span
                      key={`${name}-${index}`}
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border transition-colors ${
                        isSpeaking
                          ? 'bg-brand-500 text-white border-brand-500'
                          : 'bg-slate-50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      {name}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500 text-sm text-center px-4">
              Enter one or more names above to read aloud
            </div>
          )}
        </div>
      )}
    </div>
  );
};
