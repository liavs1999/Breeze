import { useEffect, useRef, useState } from 'react';

/** The parts of the Web Speech API used here (TypeScript's DOM types do not include it). */
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const Recognizer: (new () => Recognition) | undefined =
  typeof window === 'undefined' ? undefined : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition);

export const dictationSupported = Boolean(Recognizer);

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in the browser to speak your question.',
  'service-not-allowed': 'Speech recognition is not available in this browser.',
  'no-speech': "Didn't hear anything. Tap the microphone and try again.",
  'audio-capture': 'No microphone was found.',
  network: 'Speech recognition needs an internet connection.',
};

/**
 * Speech to text with the browser's own recognizer (Chrome, Edge, Safari). Words appear in the input
 * as they are recognized, after any text already typed; nothing is sent until the user presses send.
 * It stops by itself after a pause, or when stop() is called.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const report = useRef(onText);
  report.current = onText;

  useEffect(() => () => recognition.current?.abort(), []);

  const start = (typed: string) => {
    if (!Recognizer || recognition.current) return;
    const r = new Recognizer();
    r.lang = navigator.language || 'en-US';
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    const before = typed.trimEnd();
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      said = said.trim();
      report.current(before && said ? `${before} ${said}` : before || said);
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted') setError(ERRORS[e.error] ?? 'Speech recognition failed. Try again.');
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    setError(null);
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      recognition.current = null;
      setError('Speech recognition could not start.');
    }
  };

  return { listening, error, start, stop: () => recognition.current?.stop() };
}
