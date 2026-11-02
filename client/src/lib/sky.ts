import type { ChatMessage } from './types';

/**
 * The sky behind the app: the weather (and time of day) of the place the chat is about fills the
 * whole page. Each sky is four colors from the zenith down to the horizon, plus the glow of the sun
 * or moon; the backdrop (SkyBackdrop) adds clouds, rain, snow or stars for the sky's family. The
 * NowCard uses the same skies for its own gradient.
 */
export type SkyFamily = 'clear' | 'partly' | 'overcast' | 'fog' | 'rain' | 'snow' | 'storm';

export interface Sky {
  family: SkyFamily;
  isDay: boolean;
  zenith: string;
  mid: string;
  horizon: string;
  glow: string;
  /** The two ends, for small surfaces (the now card, the composer beam). */
  top: string;
  bottom: string;
}

type Palette = [zenith: string, mid: string, horizon: string, glow: string];

const SKIES: Record<SkyFamily, { day: Palette; night: Palette }> = {
  clear: { day: ['#1666d0', '#3d8de4', '#8fc6f3', '#fff0c2'], night: ['#040a1c', '#0a1836', '#1c3361', '#3b5591'] },
  partly: { day: ['#2d6fc0', '#5592d6', '#a7c9ea', '#fff3d6'], night: ['#081024', '#13213f', '#2a3b5d', '#3e4d71'] },
  overcast: { day: ['#56677a', '#768698', '#a8b4c1', '#d7dde4'], night: ['#0f131a', '#1a2029', '#2c3440', '#3a434f'] },
  fog: { day: ['#7f8b97', '#9ea9b4', '#c9d0d7', '#e9ecef'], night: ['#181c22', '#23282f', '#363c45', '#464d57'] },
  rain: { day: ['#344455', '#4e6074', '#7a8b9e', '#9aabbd'], night: ['#080d14', '#111924', '#212c3b', '#2c394b'] },
  snow: { day: ['#7590ad', '#9cb2c9', '#d1dce8', '#f3f7fb'], night: ['#172033', '#243048', '#3f4d67', '#55627e'] },
  storm: { day: ['#1f232e', '#353b49', '#5a6070', '#787e8d'], night: ['#050609', '#0d0f16', '#1c1f29', '#292d38'] },
};

function family(code: number): SkyFamily {
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

export function skyFor(code: number | null | undefined, isDay: boolean): Sky {
  const f = family(code ?? 1);
  const [zenith, mid, horizon, glow] = SKIES[f][isDay ? 'day' : 'night'];
  return { family: f, isDay, zenith, mid, horizon, glow, top: zenith, bottom: horizon };
}

// ── The page sky ──────────────────────────────────────────────────────────────────────────────

const root = document.documentElement;
const isDarkScheme = () => root.getAttribute('data-mantine-color-scheme') === 'dark';

/** The weather the page follows; null before any weather is in the chat (a clear sky). */
let weather: { code: number | null; isDay: boolean } | null = null;
let applied = '';

/**
 * Light mode shows the place's sky as it is now; dark mode shows the same weather after dark, so the
 * page stays dark. Before any weather: a clear day in light mode, a clear night in dark mode.
 */
function pageSky(): Sky {
  const night = isDarkScheme();
  if (!weather) return skyFor(1, !night);
  return skyFor(weather.code, weather.isDay && !night);
}

function apply() {
  const sky = pageSky();
  const key = `${sky.family}-${sky.isDay}`;
  if (key === applied) return;
  applied = key;
  const s = root.style;
  s.setProperty('--sky-zenith', sky.zenith);
  s.setProperty('--sky-mid', sky.mid);
  s.setProperty('--sky-horizon', sky.horizon);
  s.setProperty('--sky-glow', sky.glow);
  s.setProperty('--sky-top', sky.top);
  s.setProperty('--sky-bottom', sky.bottom);
  // Text that sits on the sky itself (the welcome, the footnote) turns dark on pale skies.
  s.setProperty('--on-sky', inkOn(mix(sky.zenith, sky.mid)));
  s.setProperty('--on-horizon', inkOn(sky.horizon));
  root.dataset.sky = sky.family;
  root.dataset.daylight = sky.isDay ? 'day' : 'night';
}

function setWeather(next: { code: number | null; isDay: boolean } | null) {
  weather = next;
  apply();
}

/** Follows the most recent weather in the conversation: current conditions, else the latest chart. */
export function skyFromMessages(messages: ChatMessage[]): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j] as any;
      if (p.state !== 'output-available') continue;
      if (p.type === 'tool-get_current') return setWeather({ code: p.output.weatherCode, isDay: p.output.isDay });
      if (p.type === 'tool-show_chart') {
        const spec = p.output;
        if (spec.kind === 'hourly' && spec.hours?.length) {
          // The hour of the window at the place's current time of day (so tomorrow at this hour).
          const hourNow = localHourOfDay(spec.place?.timezone);
          const withCode = spec.hours.filter((x: any) => x.code != null);
          const h = withCode.find((x: any) => Number(x.time.slice(11, 13)) === hourNow) ?? withCode[0] ?? spec.hours[0];
          return setWeather({ code: h.code, isDay: h.isDay ?? true });
        }
        if (spec.kind === 'temperature_range' && spec.days?.[0]?.code != null) return setWeather({ code: spec.days[0].code, isDay: true });
      }
    }
  }
  setWeather(null);
}

function localHourOfDay(timeZone: string | undefined): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  } catch {
    return new Date().getHours();
  }
}

/**
 * Whether the welcome is showing: the sun (or moon) rises to the middle of the page for it. The first
 * call places it without motion (a page load should not start with the sun travelling).
 */
export function setSkyHome(home: boolean) {
  root.dataset.home = String(home);
  if (!root.dataset.skyReady) requestAnimationFrame(() => requestAnimationFrame(() => (root.dataset.skyReady = 'true')));
}

// ── Contrast ──────────────────────────────────────────────────────────────────────────────────

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function mix(a: string, b: string): string {
  const [x, y] = [channels(a), channels(b)];
  return `#${x.map((v, i) => Math.round((v + y[i]) / 2).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White on darker skies, deep ink on pale ones: whichever has the higher contrast. */
function inkOn(hex: string): string {
  const l = luminance(hex);
  const white = 1.05 / (l + 0.05);
  const ink = (l + 0.05) / (luminance('#0b1424') + 0.05);
  // White reads as part of the sky, so it wins unless deep ink is clearly better (pale fog, snow).
  return white * 1.5 >= ink ? '#ffffff' : '#0b1424';
}

apply();
// Switching light and dark mode turns the page sky to day or night at once.
new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['data-mantine-color-scheme'] });
