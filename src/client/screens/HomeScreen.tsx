import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { LogoMark, Wordmark } from '../components/Logo';
import { fetchHealth } from '../lib/api';
import { navigate } from '../lib/router';
import { removeCard, useHistory, type ScannedCard } from '../lib/storage';

function friendlyDate(timestamp: number): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date()) - day(new Date(timestamp))) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

const STEPS = ['Put your card on a table.', 'Fit the card in the box.', 'Tap the big red button.'];

export function HomeScreen() {
  const history = useHistory();
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchHealth().then((health) => {
      if (alive && health && !health.configured) setNeedsSetup(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-7 px-5 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3">
        <LogoMark size={76} className="animate-float" />
        <div>
          <h1 className="text-[2.6rem] leading-none">
            <Wordmark />
          </h1>
          <p className="mt-1 text-lg font-bold text-ink/70">I read your cards with you!</p>
        </div>
      </header>

      {needsSetup && (
        <p role="status" className="sticker bg-white px-4 py-3 text-base font-bold">
          <span aria-hidden="true">🔧 </span>
          Grown-up: PokéReader needs a DeepSeek key before it can scan. Add <code>DEEPSEEK_API_KEY</code> to the
          server's <code>.env</code> file and restart it.
        </p>
      )}

      <section className="sticker bg-sun p-5">
        <button
          type="button"
          onClick={() => navigate({ name: 'scan' })}
          className="sticker pressable flex w-full items-center justify-center gap-3 bg-berry px-6 py-6 font-display text-[2rem] font-extrabold leading-none text-white"
        >
          <Icon name="camera" size={44} />
          Scan a Card
        </button>

        <ol className="mt-5 grid gap-2.5">
          {STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-3 text-xl font-bold">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-white font-display text-2xl font-extrabold leading-none"
              >
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="font-display text-3xl font-extrabold">
          My cards
        </h2>
        {history.length === 0 ? (
          <div className="mt-3 rounded-3xl border-[3px] border-dashed border-ink/35 px-5 py-8 text-center">
            <p aria-hidden="true" className="text-5xl">
              ✨
            </p>
            <p className="mt-2 text-xl font-bold text-ink/70">No cards yet. Scan your first card!</p>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-4">
            {history.map((entry) => (
              <RecentCard key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/** A saved card. Removing takes two taps so a small finger cannot delete one by accident. */
function RecentCard({ entry }: { entry: ScannedCard }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(timer);
  }, [confirming]);

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => navigate({ name: 'card', id: entry.id })}
        className="sticker pressable flex w-full flex-col overflow-hidden bg-white text-left"
      >
        <span className="block aspect-[5/6] w-full bg-mist">
          {entry.image ? (
            <img src={entry.image} alt="" className="size-full object-cover object-top" />
          ) : (
            <span aria-hidden="true" className="grid size-full place-items-center text-6xl">
              🃏
            </span>
          )}
        </span>
        <span className="block w-full border-t-[3px] border-ink px-3 py-2">
          <span className="block truncate font-display text-xl font-extrabold leading-tight">{entry.card.name}</span>
          <span className="block text-sm font-bold text-ink/60">{friendlyDate(entry.scannedAt)}</span>
        </span>
      </button>

      {confirming ? (
        <button
          type="button"
          onClick={() => removeCard(entry.id)}
          className="absolute right-2 top-2 rounded-full border-[2.5px] border-ink bg-berry px-3 py-2 font-display text-base font-extrabold leading-none text-white"
        >
          Remove?
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Remove ${entry.card.name}`}
          className="absolute right-2 top-2 grid size-11 place-items-center rounded-full border-[2.5px] border-ink bg-white"
        >
          <Icon name="close" size={22} />
        </button>
      )}
    </li>
  );
}
