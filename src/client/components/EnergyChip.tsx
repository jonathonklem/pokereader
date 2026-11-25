import { energyStyle } from '../lib/energy';

/** A round energy symbol. `label` adds the type name beside it. */
export function EnergyChip({ type, size = 34, label = false }: { type: string; size?: number; label?: boolean }) {
  const style = energyStyle(type);
  const dot = (
    <span
      role="img"
      aria-label={`${type} energy`}
      className="inline-grid shrink-0 place-items-center rounded-full border-[2.5px] border-ink leading-none"
      style={{ width: size, height: size, background: style.color, fontSize: size * 0.5 }}
    >
      <span aria-hidden="true">{style.glyph}</span>
    </span>
  );
  if (!label) return dot;
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border-[2.5px] border-ink py-1 pl-1 pr-3 font-display text-lg font-bold leading-none"
      style={{ background: style.color, color: style.ink }}
    >
      <span
        aria-hidden="true"
        className="grid place-items-center rounded-full bg-white/70"
        style={{ width: size - 8, height: size - 8, fontSize: (size - 8) * 0.6 }}
      >
        {style.glyph}
      </span>
      {type}
    </span>
  );
}
