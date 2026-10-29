export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--mantine-color-sky-6)" />
      <circle cx="12.5" cy="13" r="5" fill="#fff" opacity="0.95" />
      <path d="M9.5 23h12a4.2 4.2 0 0 0 0-8.4 6.2 6.2 0 0 0-11.6 1.8A3.4 3.4 0 0 0 9.5 23z" fill="#fff" opacity="0.78" />
    </svg>
  );
}
