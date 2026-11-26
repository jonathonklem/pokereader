import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechSection } from './explain';
import { CLOUD_VOICES, MAX_SPEECH_CHARS } from '../../shared/voices';
import { fetchHealth } from './api';
import type { SpeechSpeed } from './storage';

export const SPEED_RATES: Record<SpeechSpeed, number> = { slow: 0.7, normal: 0.9, fast: 1.15 };
/** The cloud voices already speak at a good pace, so they are slowed and sped up less. */
const CLOUD_RATES: Record<SpeechSpeed, number> = { slow: 0.8, normal: 1, fast: 1.2 };

/** One shared player: once a tap has started it, phones let it keep playing section after section. */
const player: HTMLAudioElement | null = typeof Audio !== 'undefined' ? new Audio() : null;

let cloudCheck: Promise<boolean> | null = null;
/** Asks the server once whether it can read aloud in the cloud voices. */
function cloudAvailable(): Promise<boolean> {
  cloudCheck ??= fetchHealth().then((health) => Boolean(health?.cloudVoices && player));
  return cloudCheck;
}

function cloudVoiceId(chosen: string | null): string {
  return CLOUD_VOICES.find((v) => v.id === chosen)?.id ?? CLOUD_VOICES[0].id;
}

function speechUrl(text: string, voice: string): string {
  return `/api/speak?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, MAX_SPEECH_CHARS))}`;
}

export interface VoiceOption {
  id: string;
  label: string;
}


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

/**
 * Voices for the picker. With the cloud voices: a short list of men, women and kids.
 * Without them: whatever the device has, best first (these load late on some phones).
 */
export function useVoices(): { cloud: boolean; voices: VoiceOption[] } {
  const [cloud, setCloud] = useState(false);
  const [deviceNames, setDeviceNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void cloudAvailable().then((ok) => {
      if (alive) setCloud(ok);
    });
    if (!synth) return () => void (alive = false);
    const load = () => setDeviceNames([...new Set(rankedVoices().map((v) => v.name))]);
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => {
      alive = false;
      synth.removeEventListener?.('voiceschanged', load);
    };
  }, []);
  return cloud
    ? { cloud, voices: CLOUD_VOICES.map((v) => ({ id: v.id, label: v.label })) }
    : { cloud, voices: deviceNames.map((name) => ({ id: name, label: name })) };
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
 * Reads a list of sections aloud, in order, and reports which one is being spoken
 * so the screen can highlight it.
 *
 * With `cloud` on, each section is spoken by the server's voices and played as audio.
 * Otherwise, or if that fails part way, the browser's own Web Speech voice is used.
 * `supported` is false where neither exists; the app then hides the audio controls.
 */
export function useSpeech(speed: SpeechSpeed, voiceName: string | null = null, cloud = false) {
  const [speaking, setSpeaking] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastRead, setLastRead] = useState<SpeechSection[] | null>(null);
  const run = useRef(0);
  const latest = useRef({ speed, voiceName, cloud });
  latest.current = { speed, voiceName, cloud };

  const silence = useCallback(() => {
    synth?.cancel();
    if (player) {
      player.onended = null;
      player.onerror = null;
      player.pause();
    }
  }, []);

  const stop = useCallback(() => {
    run.current += 1;
    silence();
    setSpeaking(false);
    setActiveId(null);
  }, [silence]);

  const speakOnDevice = useCallback(
    (sections: SpeechSection[], thisRun: number) => {
      if (!synth) return stop();
      const voice = pickVoice(latest.current.voiceName);
      const queue = sections.flatMap((section) => sentences(section.text).map((text) => ({ id: section.id, text })));
      queue.forEach((item, index) => {
        const utterance = new SpeechSynthesisUtterance(item.text);
        if (voice) utterance.voice = voice;
        utterance.lang = voice?.lang ?? 'en-US';
        utterance.rate = SPEED_RATES[latest.current.speed];
        utterance.pitch = pitchFor(item.text);
        utterance.onstart = () => {
          if (run.current === thisRun) setActiveId(item.id);
        };
        utterance.onend = () => {
          if (run.current === thisRun && index === queue.length - 1) stop();
        };
        // Any failure ends this read-through rather than leaving the button stuck on "Stop".
        utterance.onerror = () => {
          if (run.current === thisRun) stop();
        };
        synth.speak(utterance);
      });
    },
    [stop],
  );

  const speakFromCloud = useCallback(
    (sections: SpeechSection[], thisRun: number) => {
      if (!player) return speakOnDevice(sections, thisRun);
      const voice = cloudVoiceId(latest.current.voiceName);
      const play = (index: number) => {
        if (run.current !== thisRun) return;
        const section = sections[index];
        if (!section) return stop();
        // If the server voice fails, the device's own voice finishes the reading.
        const fallBack = () => {
          if (run.current !== thisRun) return;
          player.onended = null;
          player.onerror = null;
          speakOnDevice(sections.slice(index), thisRun);
        };
        setActiveId(section.id);
        player.onended = () => play(index + 1);
        player.onerror = fallBack;
        player.src = speechUrl(section.text, voice);
        const rate = CLOUD_RATES[latest.current.speed];
        player.defaultPlaybackRate = rate;
        player.playbackRate = rate;
        player.play().catch((err: unknown) => {
          // "AbortError" just means a newer play() or stop() took over.
          if ((err as DOMException | null)?.name !== 'AbortError') fallBack();
        });
      };
      play(0);
    },
    [speakOnDevice, stop],
  );

  const speak = useCallback(
    (sections: SpeechSection[]) => {
      if (sections.length === 0 || (!synth && !player)) return;
      const thisRun = ++run.current;
      silence();
      setLastRead(sections);
      setSpeaking(true);
      setActiveId(sections[0]?.id ?? null);
      if (latest.current.cloud) speakFromCloud(sections, thisRun);
      else speakOnDevice(sections, thisRun);
    },
    [silence, speakFromCloud, speakOnDevice],
  );

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
      silence();
    };
  }, [stop, silence]);

  return {
    supported: synth !== null || (cloud && player !== null),
    speaking,
    activeId,
    canReplay: lastRead !== null,
    speak,
    stop,
    replay,
  };
}
