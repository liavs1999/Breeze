/**
 * Temperature → color on a fixed °C scale (as in Apple Weather), so the same color means the same
 * temperature in every chart and every place. The color is redundant with the line's height (the
 * position carries the value; tooltip and table carry the numbers), so it adds meaning, not data.
 */
const RAMP: { t: number; rgb: [number, number, number] }[] = [
  { t: -15, rgb: [111, 108, 240] }, // deep cold
  { t: -5, rgb: [61, 139, 242] }, // freezing
  { t: 5, rgb: [51, 181, 201] }, // cold
  { t: 13, rgb: [92, 196, 138] }, // cool
  { t: 19, rgb: [201, 205, 74] }, // mild
  { t: 24, rgb: [243, 181, 60] }, // warm
  { t: 29, rgb: [240, 138, 53] }, // hot
  { t: 35, rgb: [226, 85, 63] }, // very hot
];

export function temperatureColor(celsius: number): string {
  if (celsius <= RAMP[0].t) return rgb(RAMP[0].rgb);
  const last = RAMP[RAMP.length - 1];
  if (celsius >= last.t) return rgb(last.rgb);
  const i = RAMP.findIndex((s) => s.t > celsius);
  const a = RAMP[i - 1];
  const b = RAMP[i];
  const k = (celsius - a.t) / (b.t - a.t);
  return rgb([0, 1, 2].map((j) => Math.round(a.rgb[j] + (b.rgb[j] - a.rgb[j]) * k)) as [number, number, number]);
}

/**
 * Stops for a vertical SVG gradient whose top is `top` °C and bottom is `bottom` °C: the colors match
 * the temperature at each height of a line drawn on a matching y-axis.
 */
export function gradientStops(top: number, bottom: number): { offset: number; color: string }[] {
  if (top <= bottom) return [{ offset: 0, color: temperatureColor(top) }, { offset: 1, color: temperatureColor(top) }];
  const inside = RAMP.filter((s) => s.t < top && s.t > bottom).map((s) => s.t);
  return [top, ...inside.reverse(), bottom].map((t) => ({ offset: (top - t) / (top - bottom), color: temperatureColor(t) }));
}

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;
