import type { CardAttack, CardData, CardModifier } from '../../shared/types';
import { energyStyle } from './energy';

/**
 * Explanations for the parts of a card that mean the same thing on every card
 * (stage, weakness, retreat and so on). These are written once here rather than
 * asked of the AI each time: it is free, instant and always worded the same way.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const digits = (value: string | null) => value?.replace(/[^\d]/g, '') ?? '';

export function explainStage(card: CardData): string | null {
  if (!card.stage) return null;
  const stage = card.stage.toLowerCase();
  if (stage === 'basic') return 'A Basic Pokémon! It can jump right onto your Bench.';
  if (stage === 'stage 1' || stage === 'stage 2') {
    return card.evolvesFrom
      ? `A ${card.stage} Pokémon! Put it on top of ${card.evolvesFrom} and watch it evolve.`
      : `A ${card.stage} Pokémon! Put it on top of the Pokémon it evolves from.`;
  }
  return card.evolvesFrom ? `Put this card on top of ${card.evolvesFrom} to power it up!` : null;
}

export function explainCost(attack: CardAttack): string {
  const cost = attack.energyCost;
  if (cost.length === 0) return 'This attack is free! No Energy needed.';
  const counts = new Map<string, number>();
  for (const type of cost) counts.set(type, (counts.get(type) ?? 0) + 1);
  const parts = [...counts].map(([type, n]) =>
    type === 'Colorless' ? `${n} of any kind` : `${n} ${energyStyle(type).spoken}`,
  );
  const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `Power it up with ${plural(cost.length, 'Energy card')}: ${joined}.`;
}

export function explainDamage(attack: CardAttack): string | null {
  if (!attack.damage) return null;
  return /^\d+$/.test(attack.damage) ? `It hits for ${attack.damage} damage!` : null;
}

export function explainWeakness(weakness: CardModifier): string {
  const base = `Watch out! ${weakness.type} attacks hurt this Pokémon more.`;
  const n = digits(weakness.value);
  if (!weakness.value || !n) return base;
  if (/[×x*]/i.test(weakness.value)) return `${base} ${n === '2' ? 'They do double damage.' : `They do ${n} times the damage.`}`;
  return `${base} They do ${n} more damage.`;
}

export function explainResistance(resistance: CardModifier): string {
  const base = `Tough stuff! ${resistance.type} attacks hurt this Pokémon less.`;
  const n = digits(resistance.value);
  return n ? `${base} They do ${n} less damage.` : base;
}

export function explainRetreat(cost: number): string {
  if (cost === 0) return 'This Pokémon can zip back to the Bench for free!';
  return `To pull this Pokémon back to the Bench, take ${plural(cost, 'Energy card')} off it and put ${cost === 1 ? 'it' : 'them'} in the discard pile.`;
}

/** One thing that can be read aloud; `id` matches a section on the card screen. */
export interface SpeechSection {
  id: string;
  text: string;
}

/** Everything on the card, in reading order, for the Read to Me button. */
export function buildScript(card: CardData): SpeechSection[] {
  const sections: SpeechSection[] = [
    { id: 'about', text: `${card.name}!${card.hp === null ? '' : ` ${card.hp} HP.`} ${card.overallExplanation}` },
  ];
  const add = (id: string, ...parts: (string | null)[]) => {
    const text = parts.filter(Boolean).join(' ');
    if (text) sections.push({ id, text });
  };

  add('basics', explainStage(card));
  card.abilities.forEach((a, i) => add(`ability-${i}`, `${a.label ?? 'Ability'}: ${a.name}.`, a.simpleExplanation));
  card.attacks.forEach((a, i) =>
    add(`attack-${i}`, `Attack: ${a.name}.`, explainCost(a), explainDamage(a), a.simpleExplanation),
  );
  card.rules.forEach((r, i) => add(`rule-${i}`, r.title ? `${r.title}.` : null, r.simpleExplanation));
  if (card.weakness) add('weakness', `Weakness. ${explainWeakness(card.weakness)}`);
  if (card.resistance) add('resistance', `Resistance. ${explainResistance(card.resistance)}`);
  if (card.retreatCost !== null) add('retreat', `Retreat. ${explainRetreat(card.retreatCost)}`);
  return sections;
}
