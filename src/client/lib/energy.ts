/** How each energy type looks. Unknown types fall back to a plain grey chip. */
export interface EnergyStyle {
  color: string;
  ink: string;
  glyph: string;
  /** The word a child would say out loud. */
  spoken: string;
}

const STYLES: Record<string, EnergyStyle> = {
  Grass: { color: '#5fbf63', ink: '#12331a', glyph: '🍃', spoken: 'Grass' },
  Fire: { color: '#f2643a', ink: '#ffffff', glyph: '🔥', spoken: 'Fire' },
  Water: { color: '#45a9f0', ink: '#0d2c47', glyph: '💧', spoken: 'Water' },
  Lightning: { color: '#ffd23f', ink: '#3d2f00', glyph: '⚡', spoken: 'Lightning' },
  Psychic: { color: '#a871d6', ink: '#ffffff', glyph: '🔮', spoken: 'Psychic' },
  Fighting: { color: '#d8823c', ink: '#ffffff', glyph: '✊', spoken: 'Fighting' },
  Darkness: { color: '#3d4a5c', ink: '#ffffff', glyph: '🌙', spoken: 'Darkness' },
  Metal: { color: '#a3b0bd', ink: '#1b2a4e', glyph: '⚙️', spoken: 'Metal' },
  Dragon: { color: '#c8a22a', ink: '#2e2400', glyph: '🐉', spoken: 'Dragon' },
  Fairy: { color: '#f390c3', ink: '#4a0f2c', glyph: '✨', spoken: 'Fairy' },
  Colorless: { color: '#ece7d8', ink: '#1b2a4e', glyph: '⭐', spoken: 'any kind' },
};

const FALLBACK: EnergyStyle = { color: '#dfe5f0', ink: '#1b2a4e', glyph: '❔', spoken: '' };

export function energyStyle(type: string): EnergyStyle {
  return STYLES[type] ?? { ...FALLBACK, spoken: type };
}
