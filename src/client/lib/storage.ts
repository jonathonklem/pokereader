import { useSyncExternalStore } from 'react';
import type { CardData } from '../../shared/types';

/**
 * Everything the app remembers lives in LocalStorage on this device:
 * recently scanned cards (which double as the scan cache) and a few preferences.
 * Kept behind this small module so a later version can swap in profiles,
 * a collection, or IndexedDB without touching the screens.
 */

const HISTORY_KEY = 'pokereader.history.v1';
const PREFS_KEY = 'pokereader.prefs.v1';
/** Each entry is roughly 50 KB with its picture, so this stays well under the ~5 MB browser limit. */
export const MAX_HISTORY = 24;

export interface ScannedCard {
  id: string;
  scannedAt: number;
  card: CardData;
  /** Small JPEG data URL. Null if the browser had no room to store it. */
  image: string | null;
  hash: string | null;
}

export type SpeechSpeed = 'slow' | 'normal' | 'fast';

export interface Prefs {
  speechSpeed: SpeechSpeed;
}

const DEFAULT_PREFS: Prefs = { speechSpeed: 'normal' };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function isScannedCard(value: unknown): value is ScannedCard {
  const v = value as ScannedCard | null;
  return !!v && typeof v.id === 'string' && typeof v.scannedAt === 'number' && !!v.card && typeof v.card.name === 'string';
}

let history: ScannedCard[] = (() => {
  const stored = read<unknown>(HISTORY_KEY, []);
  return Array.isArray(stored) ? stored.filter(isScannedCard) : [];
})();
let prefs: Prefs = { ...DEFAULT_PREFS, ...read<Partial<Prefs>>(PREFS_KEY, {}) };

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Saves the list, shedding pictures and then the oldest cards if the browser is out of room. */
function persistHistory(next: ScannedCard[]) {
  let attempt = next.slice(0, MAX_HISTORY);
  for (;;) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(attempt));
      break;
    } catch {
      const lastWithImage = attempt.findLastIndex((e) => e.image !== null);
      if (lastWithImage > 0) {
        attempt = attempt.map((e, i) => (i === lastWithImage ? { ...e, image: null } : e));
      } else if (attempt.length > 1) {
        attempt = attempt.slice(0, -1);
      } else {
        break; // Storage is unavailable (private mode). Keep working from memory.
      }
    }
  }
  history = attempt;
  emit();
}

export function useHistory(): ScannedCard[] {
  return useSyncExternalStore(subscribe, () => history);
}

export function findCard(id: string): ScannedCard | undefined {
  return history.find((e) => e.id === id);
}

export function findByHash(hash: string | null): ScannedCard | undefined {
  return hash ? history.find((e) => e.hash === hash) : undefined;
}

export function saveScan(card: CardData, image: string | null, hash: string | null): ScannedCard {
  const entry: ScannedCard = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    scannedAt: Date.now(),
    card,
    image,
    hash,
  };
  persistHistory([entry, ...history]);
  // If storage was so full that even this entry was dropped, still show it for this session.
  if (!history.some((e) => e.id === entry.id)) history = [entry, ...history];
  return entry;
}

export function removeCard(id: string) {
  persistHistory(history.filter((e) => e.id !== id));
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, () => prefs);
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences still apply for this session.
  }
  emit();
}
