import { useId } from 'react';

/** App mark: a sky gradient tile with a sun behind a cloud. */
export function Logo({ size = 26 }: { size?: number }) {
  const id = `logo${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5aaeff" />
          <stop offset="1" stopColor="#0a6cf0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <circle cx="12.5" cy="12.5" r="5" fill="#ffd60a" />
      <path d="M9.5 23.5h12.4a4.3 4.3 0 0 0 0-8.6 6.3 6.3 0 0 0-11.8 1.9A3.4 3.4 0 0 0 9.5 23.5z" fill="#fff" />
    </svg>
  );
}
