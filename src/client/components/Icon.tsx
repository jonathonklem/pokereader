const PATHS = {
  camera: 'M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 2.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  back: 'M14.5 5 8 12l6.5 7',
  speaker: 'M4 10v4h3l5 4V6l-5 4H4Zm11.5-1.5a4.5 4.5 0 0 1 0 7M18 6a8 8 0 0 1 0 12',
  stop: 'M7 7h10v10H7z',
  replay: 'M5 12a7 7 0 1 0 2.3-5.2M5 4.5V8h3.5',
  flip: 'M4 9h13l-3-3m6 9H7l3 3',
  photo: 'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm0 10 4.5-4.5 3.5 3.5 3-3 5 4.5M9 10.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z',
  close: 'M6 6l12 12M18 6 6 18',
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z',
} as const;

export type IconName = keyof typeof PATHS;

const FILLED: IconName[] = ['stop'];

export function Icon({ name, size = 28, className }: { name: IconName; size?: number; className?: string }) {
  const filled = FILLED.includes(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
