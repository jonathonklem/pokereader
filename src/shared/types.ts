/**
 * Types shared by the server and the browser app.
 * The server guarantees every CardData it returns matches this shape.
 */

export const ENERGY_TYPES = [
  'Grass',
  'Fire',
  'Water',
  'Lightning',
  'Psychic',
  'Fighting',
  'Darkness',
  'Metal',
  'Dragon',
  'Fairy',
  'Colorless',
] as const;

export type CardKind = 'pokemon' | 'trainer' | 'energy';

export interface CardAttack {
  name: string;
  /** One entry per energy symbol, in printed order. May be empty for free attacks. */
  energyCost: string[];
  /** Exactly as printed, e.g. "30", "20+", "50×". Null when the attack shows no number. */
  damage: string | null;
  originalText: string | null;
  simpleExplanation: string;
}

export interface CardAbility {
  name: string;
  /** The label printed on the card, e.g. "Ability" or "Poké-Power". */
  label: string | null;
  originalText: string | null;
  simpleExplanation: string;
}

/** Trainer text, Special Energy text and rule boxes (for example the Pokémon ex rule). */
export interface CardRule {
  title: string | null;
  originalText: string | null;
  simpleExplanation: string;
}

/** Weakness or resistance: an energy type plus the printed value ("×2", "-30"). */
export interface CardModifier {
  type: string;
  value: string | null;
}

export interface CardData {
  kind: CardKind;
  name: string;
  hp: number | null;
  type: string | null;
  stage: string | null;
  evolvesFrom: string | null;
  trainerType: string | null;
  attacks: CardAttack[];
  abilities: CardAbility[];
  rules: CardRule[];
  weakness: CardModifier | null;
  resistance: CardModifier | null;
  retreatCost: number | null;
  overallExplanation: string;
  /** Child friendly notes about anything the reader could not see clearly. */
  unclearParts: string[];
}

export type ScanErrorCode =
  | 'no_image'
  | 'unsupported_type'
  | 'too_large'
  | 'bad_image'
  | 'not_configured'
  | 'not_a_card'
  | 'ai_timeout'
  | 'ai_unavailable'
  | 'ai_bad_response'
  | 'rate_limited'
  | 'network'
  | 'server_error';

export interface ScanSuccess {
  success: true;
  card: CardData;
}

export interface ScanFailure {
  success: false;
  error: { code: ScanErrorCode; message: string };
}

export type ScanResponse = ScanSuccess | ScanFailure;

export interface HealthResponse {
  ok: true;
  configured: boolean;
  /** True when the server can read aloud in the cloud voices (see shared/voices.ts). */
  cloudVoices: boolean;
}
