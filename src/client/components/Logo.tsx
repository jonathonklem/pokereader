/** The PokéReader mark: a card under a magnifying glass. Original artwork, no official logos. */
export function LogoMark({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-hidden="true">
      <g transform="rotate(-8 60 60)">
        <rect x="26" y="10" width="62" height="88" rx="10" fill="#1b2a4e" />
        <rect x="30" y="14" width="54" height="80" rx="7" fill="#ffcb05" />
        <rect x="36" y="20" width="42" height="30" rx="5" fill="#fff6dc" />
        <path d="M60 23 49 37h7l-3 11 12-15h-8z" fill="#e5383b" stroke="#1b2a4e" strokeWidth="2.4" strokeLinejoin="round" />
        <rect x="36" y="57" width="42" height="5" rx="2.5" fill="#1b2a4e" />
        <rect x="36" y="67" width="30" height="5" rx="2.5" fill="#1b2a4e" />
        <rect x="36" y="77" width="36" height="5" rx="2.5" fill="#1b2a4e" />
      </g>
      <circle cx="84" cy="82" r="19" fill="#ffffff" fillOpacity="0.92" stroke="#1b2a4e" strokeWidth="6" />
      <path d="m98 96 13 13" stroke="#1b2a4e" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight ${className}`}>
      <span className="text-berry">Poké</span>
      <span className="text-ink">Reader</span>
    </span>
  );
}
