import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechSection } from './explain';
import type { SpeechSpeed } from './storage';

export const SPEED_RATES: Record<SpeechSpeed, number> = { slow: 0.7, normal: 0.9, fast: 1.15 };

const synth: SpeechSynthesis | null =
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

/** Picks an English voice already on the device, preferring the phone's own language setting. */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = synth?.getVoices() ?? [];
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const wanted = navigator.language.toLowerCase();
  return (
    english.find((v) => v.lang.toLowerCase().replace('_', '-') === wanted && v.localService) ??
    english.find((v) => v.lang.toLowerCase().replace('_', '-') === wanted) ??
    english.find((v) => v.localService) ??
    english[0] ??
    null
  );
}

/** Android Chrome cuts off long utterances, so speak one sentence at a time. */
function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

/**
 * Text to speech with the browser's Web Speech API.
 * Reads a list of sections in order and reports which one is being spoken,
 * so the screen can highlight it. `supported` is false where there is no
 * speech engine; the app then simply hides the audio controls.
 */
export function useSpeech(speed: SpeechSpeed) {
  const [speaking, setSpeaking] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<SpeechSection[] | null>(null);
  const run = useRef(0);
  const rate = useRef(SPEED_RATES[speed]);
  rate.current = SPEED_RATES[speed];

  const stop = useCallback(() => {
    run.current += 1;
    synth?.cancel();
    setSpeaking(false);
    setActiveId(null);
  }, []);

  const speak = useCallback((sections: SpeechSection[]) => {
    if (!synth || sections.length === 0) return;
    const thisRun = ++run.current;
    synth.cancel();
    const voice = pickVoice();

    const queue = sections.flatMap((section) => sentences(section.text).map((text) => ({ id: section.id, text })));
    queue.forEach((item, index) => {
      const utterance = new SpeechSynthesisUtterance(item.text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? 'en-US';
      utterance.rate = rate.current;
      utterance.onstart = () => {
        if (run.current === thisRun) setActiveId(item.id);
      };
      const finish = () => {
        if (run.current === thisRun && index === queue.length - 1) {
          setSpeaking(false);
          setActiveId(null);
        }
      };
      utterance.onend = finish;
      utterance.onerror = () => {
        // Any failure ends this read-through rather than leaving the button stuck on "Stop".
        if (run.current === thisRun) {
          run.current += 1;
          synth.cancel();
          setSpeaking(false);
          setActiveId(null);
        }
      };
      synth.speak(utterance);
    });

    setLastRead(sections);
    setSpeaking(true);
    setActiveId(sections[0]?.id ?? null);
  }, []);

  const replay = useCallback(() => {
    if (lastRead) speak(lastRead);
  }, [lastRead, speak]);

  // Voices load late on some phones; asking once nudges the browser to fetch them.
  useEffect(() => {
    synth?.getVoices();
  }, []);

  // Never keep talking after leaving the screen or switching apps.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      run.current += 1;
      synth?.cancel();
    };
  }, [stop]);

  return { supported: synth !== null, speaking, activeId, canReplay: lastRead !== null, speak, stop, replay };
}
