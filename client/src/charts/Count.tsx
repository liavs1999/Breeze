import { createContext, useContext, useEffect, useState } from 'react';
import { orbitNow, useStage } from '../lib/orbit';

const appStart = performance.now();

/**
 * Whether a card is arriving now (a part that streams in) rather than being restored with a saved
 * chat: only arrivals animate. Read once, when the card mounts.
 */
export function useArriving(): boolean {
  return useState(() => performance.now() - appStart > 2500)[0];
}

export const Arriving = createContext(false);

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * A number that counts up to its value when its card arrives ("17°" from 0 to 17), once the camera
 * has landed; anything else renders as is.
 */
export function Count({ text, duration = 1100, delay = 0 }: { text: string; duration?: number; delay?: number }) {
  const arriving = useContext(Arriving);
  const stage = useStage();
  const match = /^(-?\d+)(.*)$/.exec(text);
  const target = match ? Number(match[1]) : 0;
  const animate = arriving && !!match && !reducedMotion();
  const [value, setValue] = useState(animate ? 0 : target);
  const landed = stage !== 'search' && stage !== 'approach' && stage !== 'dive';

  useEffect(() => {
    if (!animate) return setValue(target);
    if (!landed) return;
    let raf = 0;
    const start = orbitNow() + delay;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (orbitNow() - start) / duration));
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, landed, target, duration, delay]);

  if (!match) return <>{text}</>;
  return (
    <>
      {value}
      {match[2]}
    </>
  );
}
