/**
 * The living sky behind the whole app. Every layer is always mounted; the sky's family and the time
 * of day (data-sky and data-daylight on <html>, set by lib/sky) decide which ones show, so a change
 * of weather cross-fades instead of popping. Motion is transform-only (cheap to composite) and stops
 * for prefers-reduced-motion.
 */
export function SkyBackdrop() {
  return (
    <div className="sky" aria-hidden>
      <div className="sky-gradient" />
      <div className="sky-stars" style={{ backgroundImage: STARS }} />
      <div className="sky-stars sky-stars-twinkle" style={{ backgroundImage: STARS_BRIGHT }} />
      <div className="sky-body">
        <div className="sky-halo" />
        <div className="sky-disc" />
      </div>
      <div className="sky-clouds sky-clouds-far" />
      <div className="sky-clouds sky-clouds-near" />
      <div className="sky-fog" />
      <div className="sky-rain" style={{ backgroundImage: RAIN }} />
      <div className="sky-rain sky-rain-near" style={{ backgroundImage: RAIN_NEAR }} />
      <div className="sky-snow" style={{ backgroundImage: SNOW }} />
      <div className="sky-snow sky-snow-near" style={{ backgroundImage: SNOW_NEAR }} />
      <div className="sky-flash" />
      <div className="sky-horizon" />
    </div>
  );
}

// ── Tiles, drawn once as SVG data URIs (a fixed seed, so they never reshuffle) ───────────────────

function random(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const svg = (w: number, h: number, body: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`)}")`;

function stars(seed: number, count: number, size: [number, number], alpha: [number, number]) {
  const r = random(seed);
  let body = '';
  for (let i = 0; i < count; i++) {
    const radius = size[0] + r() * (size[1] - size[0]);
    const a = alpha[0] + r() * (alpha[1] - alpha[0]);
    body += `<circle cx='${(r() * 480).toFixed(1)}' cy='${(r() * 480).toFixed(1)}' r='${radius.toFixed(2)}' fill='white' fill-opacity='${a.toFixed(2)}'/>`;
  }
  return svg(480, 480, body);
}

function streaks(seed: number, count: number, length: [number, number], alpha: number) {
  const r = random(seed);
  let body = `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='white' stop-opacity='0'/><stop offset='1' stop-color='white' stop-opacity='${alpha}'/></linearGradient></defs>`;
  for (let i = 0; i < count; i++) {
    const x = r() * 320;
    const y = r() * 320;
    const l = length[0] + r() * (length[1] - length[0]);
    body += `<rect x='${x.toFixed(1)}' y='${y.toFixed(1)}' width='1.2' height='${l.toFixed(1)}' rx='0.6' fill='url(#g)'/>`;
  }
  return svg(320, 320, body);
}

function flakes(seed: number, count: number, size: [number, number], alpha: number) {
  const r = random(seed);
  let body = '';
  for (let i = 0; i < count; i++) {
    const radius = size[0] + r() * (size[1] - size[0]);
    body += `<circle cx='${(r() * 360).toFixed(1)}' cy='${(r() * 360).toFixed(1)}' r='${radius.toFixed(2)}' fill='white' fill-opacity='${(alpha * (0.6 + r() * 0.4)).toFixed(2)}'/>`;
  }
  return svg(360, 360, body);
}

const STARS = stars(7, 140, [0.35, 0.9], [0.25, 0.75]);
const STARS_BRIGHT = stars(31, 18, [0.9, 1.4], [0.7, 1]);
const RAIN = streaks(11, 70, [14, 26], 0.38);
const RAIN_NEAR = streaks(23, 26, [28, 46], 0.5);
const SNOW = flakes(5, 60, [0.8, 1.8], 0.85);
const SNOW_NEAR = flakes(17, 22, [2, 3.4], 0.95);
