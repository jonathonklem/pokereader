import { z } from 'zod';
import { ENERGY_TYPES, type CardData } from '../../../shared/types';
import { ScanError } from '../../errors';
import type { CardAnalysis } from './types';

/**
 * Turns whatever JSON the model returned into a CardData the app can rely on.
 * Models drift (a number as a string, "Electric" for Lightning, a missing list),
 * so this is forgiving about form and strict about the final shape.
 */

const MAX_TEXT = 900;
const MAX_ITEMS = 8;

const TYPE_ALIASES: Record<string, string> = {
  electric: 'Lightning',
  dark: 'Darkness',
  steel: 'Metal',
  normal: 'Colorless',
  leaf: 'Grass',
};

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const t = value.replace(/\s+/g, ' ').trim();
  if (!t || /^(null|none|n\/a|unknown|-)$/i.test(t)) return null;
  return t.slice(0, max);
}

function wholeNumber(value: unknown, max: number): number | null {
  let n: number;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /\d/.test(value)) n = Number(value.replace(/[^\d]/g, ''));
  else return null;
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : null;
}

function energyType(value: unknown): string | null {
  const t = text(value, 30);
  if (!t) return null;
  const key = t.toLowerCase().replace(/\s*energy$/, '');
  const known = ENERGY_TYPES.find((e) => e.toLowerCase() === key);
  return known ?? TYPE_ALIASES[key] ?? t;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_ITEMS) : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function energyCost(value: unknown): string[] {
  const raw = typeof value === 'string' ? value.split(/[,/]/) : Array.isArray(value) ? value : [];
  return raw
    .slice(0, 8)
    .map(energyType)
    .filter((t): t is string => t !== null);
}

/** Accepts { type, value }, or a plain string such as "Fighting ×2". */
function modifier(value: unknown): { type: string; value: string | null } | null {
  const obj = record(value);
  if (obj) {
    const type = energyType(obj.type);
    return type ? { type, value: text(obj.value, 12) } : null;
  }
  const t = text(value, 40);
  if (!t) return null;
  const match = /^([A-Za-z]+)\s*(.*)$/.exec(t);
  const type = energyType(match?.[1] ?? t);
  return type ? { type, value: text(match?.[2], 12) } : null;
}

function retreat(value: unknown): number | null {
  if (Array.isArray(value)) return Math.min(value.length, 5);
  return wholeNumber(value, 5);
}

function kind(value: unknown, hasHp: boolean): CardData['kind'] {
  const t = (text(value, 30) ?? '').toLowerCase();
  if (t.includes('trainer')) return 'trainer';
  if (t.includes('energy')) return 'energy';
  if (t.includes('pok')) return 'pokemon';
  return hasHp ? 'pokemon' : 'trainer';
}

const explained = { originalText: z.string().nullable(), simpleExplanation: z.string().min(1) };
const modifierSchema = z.object({ type: z.string().min(1), value: z.string().nullable() }).nullable();

/** The final gate: nothing leaves the server unless it matches this. */
const cardSchema = z.object({
  kind: z.enum(['pokemon', 'trainer', 'energy']),
  name: z.string().min(1),
  hp: z.number().int().nullable(),
  type: z.string().nullable(),
  stage: z.string().nullable(),
  evolvesFrom: z.string().nullable(),
  trainerType: z.string().nullable(),
  attacks: z.array(
    z.object({ name: z.string().min(1), energyCost: z.array(z.string()), damage: z.string().nullable(), ...explained }),
  ),
  abilities: z.array(z.object({ name: z.string().min(1), label: z.string().nullable(), ...explained })),
  rules: z.array(z.object({ title: z.string().nullable(), ...explained })),
  weakness: modifierSchema,
  resistance: modifierSchema,
  retreatCost: z.number().int().nullable(),
  overallExplanation: z.string().min(1),
  unclearParts: z.array(z.string()),
});

const NO_EXPLANATION = 'I could not read this part clearly.';

export function normalizeAnalysis(raw: unknown): CardAnalysis {
  const root = record(raw);
  if (!root) throw new ScanError('ai_bad_response', 502, 'response is not a JSON object');

  if (root.success === false) return { recognized: false };

  // Accept both { success, card: {...} } and a bare card object.
  const c = record(root.card) ?? root;
  const name = text(c.name, 80);
  if (!name) return { recognized: false };

  const hp = wholeNumber(c.hp, 1000);
  const cardKind = kind(c.kind, hp !== null);
  const isPokemon = cardKind === 'pokemon';

  const candidate: CardData = {
    kind: cardKind,
    name,
    hp: isPokemon ? hp : null,
    type: energyType(c.type),
    stage: isPokemon ? text(c.stage, 30) : null,
    evolvesFrom: isPokemon ? text(c.evolvesFrom, 60) : null,
    trainerType: cardKind === 'trainer' ? text(c.trainerType, 30) : null,
    attacks: list(c.attacks).flatMap((item) => {
      const a = record(item);
      const attackName = a && text(a.name, 80);
      if (!a || !attackName) return [];
      return [
        {
          name: attackName,
          energyCost: energyCost(a.energyCost),
          damage: text(a.damage, 12),
          originalText: text(a.originalText),
          simpleExplanation: text(a.simpleExplanation) ?? NO_EXPLANATION,
        },
      ];
    }),
    abilities: list(c.abilities).flatMap((item) => {
      const a = record(item);
      const abilityName = a && text(a.name, 80);
      if (!a || !abilityName) return [];
      return [
        {
          name: abilityName,
          label: text(a.label, 30),
          originalText: text(a.originalText),
          simpleExplanation: text(a.simpleExplanation) ?? NO_EXPLANATION,
        },
      ];
    }),
    rules: list(c.rules).flatMap((item) => {
      const r = record(item);
      const simple = r && text(r.simpleExplanation);
      if (!r || !simple) return [];
      return [{ title: text(r.title, 80), originalText: text(r.originalText), simpleExplanation: simple }];
    }),
    weakness: isPokemon ? modifier(c.weakness) : null,
    resistance: isPokemon ? modifier(c.resistance) : null,
    retreatCost: isPokemon ? retreat(c.retreatCost) : null,
    overallExplanation: text(c.overallExplanation) ?? `This card is called ${name}.`,
    unclearParts: list(c.unclearParts)
      .map((p) => text(p, 200))
      .filter((p): p is string => p !== null),
  };

  const checked = cardSchema.safeParse(candidate);
  if (!checked.success) throw new ScanError('ai_bad_response', 502, 'card failed validation');
  return { recognized: true, card: checked.data };
}

/** Pulls a JSON object out of the model's reply, tolerating a ```json fence. */
export function parseModelJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new ScanError('ai_bad_response', 502, 'reply was not valid JSON');
  }
}
