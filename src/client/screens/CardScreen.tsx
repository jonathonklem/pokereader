import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { CardData } from '../../shared/types';
import { EnergyChip } from '../components/EnergyChip';
import { Icon } from '../components/Icon';
import {
  buildScript,
  explainCost,
  explainResistance,
  explainRetreat,
  explainStage,
  explainWeakness,
} from '../lib/explain';
import { navigate } from '../lib/router';
import { useSpeech, useVoiceNames } from '../lib/speech';
import { findCard, setPrefs, usePrefs, type SpeechSpeed } from '../lib/storage';

const KIND_LABEL: Record<CardData['kind'], string> = {
  pokemon: 'Pokémon',
  trainer: 'Trainer card',
  energy: 'Energy card',
};

const SPEEDS: { value: SpeechSpeed; emoji: string; label: string }[] = [
  { value: 'slow', emoji: '🐢', label: 'Slow' },
  { value: 'normal', emoji: '🙂', label: 'Normal' },
  { value: 'fast', emoji: '🐇', label: 'Fast' },
];

export function CardScreen({ id }: { id: string }) {
  const entry = findCard(id);
  const prefs = usePrefs();
  const speech = useSpeech(prefs.speechSpeed, prefs.voiceName);
  const voiceNames = useVoiceNames();

  // A stale link (for example a removed card) just goes home.
  useEffect(() => {
    if (!entry) navigate({ name: 'home' }, { replace: true });
  }, [entry]);

  // Changing speed mid-sentence starts the reading over, so the change is heard right away.
  const lastSpeed = useRef(prefs.speechSpeed);
  useEffect(() => {
    if (lastSpeed.current === prefs.speechSpeed) return;
    lastSpeed.current = prefs.speechSpeed;
    if (speech.speaking) speech.replay();
  }, [prefs.speechSpeed, speech]);

  // Picking a voice says a few words in it, or restarts the reading if one is going.
  const chooseVoice = (name: string | null) => {
    setPrefs({ voiceName: name });
    // The new choice reaches the speech hook on the next render.
    setTimeout(() => {
      if (speech.speaking) speech.replay();
      else speech.speak([{ id: 'voice-sample', text: entry ? `Hi! This is ${entry.card.name}.` : 'Hi! I can read your card.' }]);
    }, 0);
  };

  const script = useMemo(() => (entry ? buildScript(entry.card) : []), [entry]);
  if (!entry) return null;

  const { card } = entry;
  const section = (sectionId: string) => script.find((s) => s.id === sectionId);
  const listen = (sectionId: string) => {
    const found = section(sectionId);
    return speech.supported && found ? () => speech.speak([found]) : undefined;
  };
  const stageNote = explainStage(card);

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-60 pt-[max(1rem,env(safe-area-inset-top))]">
      <nav className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate({ name: 'home' })}
          className="sticker pressable flex items-center gap-1.5 bg-white py-2.5 pl-3 pr-4 font-display text-xl font-extrabold"
        >
          <Icon name="home" />
          Home
        </button>
        <button
          type="button"
          onClick={() => navigate({ name: 'scan' })}
          className="sticker pressable flex items-center gap-2 bg-berry px-4 py-2.5 font-display text-xl font-extrabold text-white"
        >
          <Icon name="camera" />
          New card
        </button>
      </nav>

      <main className="mt-5 grid gap-5">
        <header className="flex animate-pop-in items-start gap-4">
          {entry.image && (
            <img
              src={entry.image}
              alt={`Your photo of ${card.name}`}
              className="w-[38%] max-w-44 shrink-0 -rotate-2 rounded-2xl border-[3px] border-ink shadow-[0_5px_0_0_var(--color-ink)]"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold uppercase tracking-wide text-ink/60">
              {card.trainerType ?? KIND_LABEL[card.kind]}
            </p>
            <h1 className="break-words font-display text-[2.4rem] font-extrabold leading-[1.05]">{card.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {card.hp !== null && (
                <span className="rounded-full border-[2.5px] border-ink bg-berry px-3 py-1 font-display text-xl font-extrabold leading-none text-white">
                  {card.hp} HP
                </span>
              )}
              {card.type && <EnergyChip type={card.type} label />}
              {card.stage && (
                <span className="rounded-full border-[2.5px] border-ink bg-white px-3 py-1 font-display text-lg font-bold leading-none">
                  {card.stage}
                </span>
              )}
            </div>
          </div>
        </header>

        <Section id="about" title="What is this card?" tone="bg-sun" speech={speech} onListen={listen('about')}>
          <Simple>{card.overallExplanation}</Simple>
        </Section>

        {stageNote && (
          <Section id="basics" title="How to play it" tone="bg-white" speech={speech} onListen={listen('basics')}>
            <Simple>{stageNote}</Simple>
          </Section>
        )}

        {card.unclearParts.length > 0 && (
          <section className="rounded-3xl border-[3px] border-dashed border-ink bg-white/70 p-4">
            <h2 className="font-display text-2xl font-extrabold">
              <span aria-hidden="true">🔍 </span>I could not see some parts
            </h2>
            <ul className="mt-1 list-disc pl-6 text-lg font-bold">
              {card.unclearParts.map((part) => (
                <li key={part}>{part}</li>
              ))}
            </ul>
            <p className="mt-2 text-lg font-bold text-ink/70">Try a new photo with more light.</p>
          </section>
        )}

        {card.abilities.map((ability, i) => (
          <Section
            key={`ability-${i}`}
            id={`ability-${i}`}
            eyebrow={ability.label ?? 'Ability'}
            eyebrowTone="bg-berry text-white"
            title={ability.name}
            tone="bg-white"
            speech={speech}
            onListen={listen(`ability-${i}`)}
          >
            <Simple>{ability.simpleExplanation}</Simple>
            <Original text={ability.originalText} />
          </Section>
        ))}

        {card.attacks.map((attack, i) => (
          <Section
            key={`attack-${i}`}
            id={`attack-${i}`}
            eyebrow="Attack"
            eyebrowTone="bg-ink text-white"
            title={attack.name}
            tone="bg-white"
            speech={speech}
            onListen={listen(`attack-${i}`)}
            aside={
              attack.damage && (
                <span className="grid min-w-16 shrink-0 place-items-center rounded-2xl border-[3px] border-ink bg-sun px-2 py-1 text-center font-display leading-none">
                  <span className="text-3xl font-extrabold">{attack.damage}</span>
                  <span className="text-xs font-bold uppercase tracking-wide">damage</span>
                </span>
              )
            }
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {attack.energyCost.map((type, n) => (
                <EnergyChip key={n} type={type} />
              ))}
              <span className="text-lg font-bold text-ink/75">{explainCost(attack)}</span>
            </div>
            <Simple>{attack.simpleExplanation}</Simple>
            <Original text={attack.originalText} />
          </Section>
        ))}

        {card.rules.map((rule, i) => (
          <Section
            key={`rule-${i}`}
            id={`rule-${i}`}
            eyebrow={card.kind === 'pokemon' ? 'Rule' : 'What it does'}
            eyebrowTone="bg-sky text-white"
            title={rule.title ?? (card.kind === 'pokemon' ? 'Special rule' : card.name)}
            tone="bg-white"
            speech={speech}
            onListen={listen(`rule-${i}`)}
          >
            <Simple>{rule.simpleExplanation}</Simple>
            <Original text={rule.originalText} />
          </Section>
        ))}

        {card.weakness && (
          <Section id="weakness" title="Weakness" tone="bg-white" speech={speech} onListen={listen('weakness')}
            aside={<Badge type={card.weakness.type} value={card.weakness.value} />}>
            <Simple>{explainWeakness(card.weakness)}</Simple>
          </Section>
        )}

        {card.resistance && (
          <Section id="resistance" title="Resistance" tone="bg-white" speech={speech} onListen={listen('resistance')}
            aside={<Badge type={card.resistance.type} value={card.resistance.value} />}>
            <Simple>{explainResistance(card.resistance)}</Simple>
          </Section>
        )}

        {card.retreatCost !== null && (
          <Section id="retreat" title="Retreat" tone="bg-white" speech={speech} onListen={listen('retreat')}
            aside={
              <span className="flex shrink-0 items-center gap-1">
                {card.retreatCost === 0 ? (
                  <span className="rounded-full border-[2.5px] border-ink bg-leaf px-3 py-1 font-display text-lg font-extrabold leading-none text-white">
                    Free
                  </span>
                ) : (
                  Array.from({ length: card.retreatCost }, (_, n) => <EnergyChip key={n} type="Colorless" size={30} />)
                )}
              </span>
            }>
            <Simple>{explainRetreat(card.retreatCost)}</Simple>
          </Section>
        )}
      </main>

      {speech.supported && (
        <SpeechBar
          speaking={speech.speaking}
          canReplay={speech.canReplay}
          speed={prefs.speechSpeed}
          onRead={() => speech.speak(script)}
          onStop={speech.stop}
          onReplay={speech.replay}
          onSpeed={(speed) => setPrefs({ speechSpeed: speed })}
          voices={voiceNames}
          voice={prefs.voiceName}
          onVoice={chooseVoice}
        />
      )}
    </div>
  );
}

function Simple({ children }: { children: ReactNode }) {
  return <p className="text-[1.45rem] font-bold leading-snug">{children}</p>;
}

/** The card's own words, kept visually apart from the easy explanation. */
function Original({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="rounded-2xl border-2 border-dashed border-ink/40 bg-mist px-3 py-2">
      <p className="font-display text-sm font-bold uppercase tracking-wide text-ink/60">The card says</p>
      <p className="text-base leading-snug text-ink/80">{text}</p>
    </div>
  );
}

function Badge({ type, value }: { type: string; value: string | null }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <EnergyChip type={type} />
      {value && <span className="font-display text-2xl font-extrabold">{value}</span>}
    </span>
  );
}

interface SectionProps {
  id: string;
  title: string;
  tone: string;
  eyebrow?: string;
  eyebrowTone?: string;
  aside?: ReactNode;
  speech: { activeId: string | null };
  onListen?: () => void;
  children: ReactNode;
}

/** One explained part of the card. It lights up while it is being read aloud. */
function Section({ id, title, tone, eyebrow, eyebrowTone, aside, speech, onListen, children }: SectionProps) {
  const active = speech.activeId === id;
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={`sticker ${tone} p-4 transition-shadow ${active ? 'shadow-[0_5px_0_0_var(--color-ink),0_0_0_6px_var(--color-sky)]' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <span
              className={`mb-1 inline-block rounded-full px-2.5 py-0.5 font-display text-sm font-bold uppercase tracking-wide ${eyebrowTone}`}
            >
              {eyebrow}
            </span>
          )}
          <h2 id={`${id}-title`} className="break-words font-display text-[1.75rem] font-extrabold leading-tight">
            {title}
          </h2>
        </div>
        {aside}
        {onListen && (
          <button
            type="button"
            onClick={onListen}
            aria-label={`Read ${title} to me`}
            className="pressable grid size-12 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-sky text-white shadow-[0_3px_0_0_var(--color-ink)]"
          >
            <Icon name="speaker" size={26} />
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-3">{children}</div>
    </section>
  );
}

interface SpeechBarProps {
  speaking: boolean;
  canReplay: boolean;
  speed: SpeechSpeed;
  onRead: () => void;
  onStop: () => void;
  onReplay: () => void;
  onSpeed: (speed: SpeechSpeed) => void;
  voices: string[];
  voice: string | null;
  onVoice: (name: string | null) => void;
}

function SpeechBar({ speaking, canReplay, speed, onRead, onStop, onReplay, onSpeed, voices, voice, onVoice }: SpeechBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-cream px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto grid max-w-xl gap-2.5">
        <div className="flex gap-2.5">
          {speaking ? (
            <button
              type="button"
              onClick={onStop}
              className="sticker pressable flex flex-1 items-center justify-center gap-2 bg-ink px-4 py-3.5 font-display text-2xl font-extrabold text-white"
            >
              <Icon name="stop" size={30} />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onRead}
              className="sticker pressable flex flex-1 items-center justify-center gap-2 bg-sky px-4 py-3.5 font-display text-2xl font-extrabold text-white"
            >
              <Icon name="speaker" size={32} />
              Read to Me
            </button>
          )}
          <button
            type="button"
            onClick={onReplay}
            disabled={!canReplay}
            className="sticker pressable flex items-center gap-1.5 bg-white px-4 py-3.5 font-display text-xl font-extrabold disabled:opacity-40"
          >
            <Icon name="replay" />
            Again
          </button>
        </div>
        <div role="group" aria-label="Reading speed" className="grid grid-cols-3 gap-2">
          {SPEEDS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={speed === option.value}
              onClick={() => onSpeed(option.value)}
              className={`rounded-full border-[2.5px] border-ink py-2 font-display text-lg font-bold leading-none ${
                speed === option.value ? 'bg-sun' : 'bg-white'
              }`}
            >
              <span aria-hidden="true">{option.emoji} </span>
              {option.label}
            </button>
          ))}
        </div>
        {voices.length > 1 && (
          <label className="flex items-center gap-2 font-display text-lg font-bold">
            <span aria-hidden="true">🗣️</span>
            <span>Voice</span>
            <select
              value={voice && voices.includes(voice) ? voice : ''}
              onChange={(event) => onVoice(event.target.value || null)}
              className="min-w-0 flex-1 rounded-full border-[2.5px] border-ink bg-white px-3 py-1.5 font-display text-lg font-bold"
            >
              <option value="">Best one (automatic)</option>
              {voices.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

