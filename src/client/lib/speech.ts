import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechSection } from './explain';
import type { SpeechSpeed } from './storage';

export const SPEED_RATES: Record<SpeechSpeed, number> = { slow: 0.7, normal: 0.9, fast: 1.15 };

const synth: SpeechSynthesis | null =
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

// Apple ships joke voices (Zarvox, Bells...) and old robotic ones in the same list as the good ones.
const POOR_VOICES =
  /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|espeak)\b/i;
const WARM_VOICES = /\b(samantha|ava|allison|zoe|evan|nicky|joelle|noelle|susan|aria|jenny|libby|sonia)\b/i;

/** Higher is better: the most natural sounding voice the device has, in the phone's own accent. */
function voiceScore(voice: SpeechSynthesisVoice, wanted: string): number {
  const name = voice.name;
  const lang = voice.lang.toLowerCase().replace('_', '-');
  let score = 0;
  if (/natural|neural/i.test(name)) score += 100;
  else if (/premium/i.test(name)) score += 90;
  else if (/enhanced/i.test(name)) score += 80;
  else if (/siri/i.test(name)) score += 75;
  else if (/^google/i.test(name)) score += 60;
  if (WARM_VOICES.test(name)) score += 40;
  if (POOR_VOICES.test(name)) score -= 200;
  if (/compact/i.test(name)) score -= 20;
  if (lang === wanted) score += 20;
  else if (lang === 'en-us') score += 10;
  return score;
}

/** The device's English voices, best first, without the joke and robot ones. */
function rankedVoices(): SpeechSynthesisVoice[] {
  const wanted = navigator.language.toLowerCase();
  const english = (synth?.getVoices() ?? []).filter((v) => v.lang.toLowerCase().startsWith('en'));
  const decent = english.filter((v) => !POOR_VOICES.test(v.name));
  return (decent.length > 0 ? decent : english)
    .map((voice) => ({ voice, score: voiceScore(voice, wanted) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.voice);
}

/** The voice chosen in the picker if this device still has it, otherwise the best one. */
function pickVoice(chosen: string | null): SpeechSynthesisVoice | null {
  const voices = rankedVoices();
  return voices.find((v) => v.name === chosen) ?? voices[0] ?? null;
}

/** Voice names for the picker, best first. Voices load late on some phones, so this updates itself. */
export function useVoiceNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!synth) return;
    const load = () => setNames([...new Set(rankedVoices().map((v) => v.name))]);
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);
  return names;
}

/** A little lift so it does not drone: brighter overall, higher still for "Zap!" and for questions. */
function pitchFor(sentence: string): number {
  if (/!\s*$/.test(sentence)) return 1.3;
  if (/\?\s*$/.test(sentence)) return 1.2;
  return 1.1;
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
export function useSpeech(speed: SpeechSpeed, voiceName: string | null = null) {
  const [speaking, setSpeaking] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<SpeechSection[] | null>(null);
  const run = useRef(0);
  const rate = useRef(SPEED_RATES[speed]);
  rate.current = SPEED_RATES[speed];
  const chosenVoice = useRef(voiceName);
  chosenVoice.current = voiceName;

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
    const voice = pickVoice(chosenVoice.current);

    const queue = sections.flatMap((section) => sentences(section.text).map((text) => ({ id: section.id, text })));
    queue.forEach((item, index) => {
      const utterance = new SpeechSynthesisUtterance(item.text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? 'en-US';
      utterance.rate = rate.current;
      utterance.pitch = pitchFor(item.text);
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
