import { useSyncExternalStore } from 'react';
import type { ChatMessage } from './types';

/**
 * The sky behind the app: a gradient for the weather (and time of day) of the place the chat is
 * about. It tints the top of the page and fills the "now" card.
 */
export interface Sky {
  top: string;
  bottom: string;
}

const SKIES: Record<string, { day: Sky; night: Sky }> = {
  clear: { day: { top: '#2f7fd8', bottom: '#7db8ee' }, night: { top: '#0a1730', bottom: '#223c66' } },
  partly: { day: { top: '#4383c8', bottom: '#93b9de' }, night: { top: '#121d33', bottom: '#33445f' } },
  overcast: { day: { top: '#6d7c8e', bottom: '#a9b5c2' }, night: { top: '#1b2129', bottom: '#38414d' } },
  fog: { day: { top: '#8c969f', bottom: '#c3cad1' }, night: { top: '#262b31', bottom: '#454b53' } },
  rain: { day: { top: '#4f5f71', bottom: '#8796a6' }, night: { top: '#131a22', bottom: '#2c3846' } },
  snow: { day: { top: '#8ea6be', bottom: '#d1dde9' }, night: { top: '#222d42', bottom: '#46546b' } },
  storm: { day: { top: '#383d4a', bottom: '#666b7a' }, night: { top: '#101218', bottom: '#2b2e38' } },
};

function family(code: number): keyof typeof SKIES {
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

export function skyFor(code: number | null | undefined, isDay: boolean): Sky {
  return SKIES[family(code ?? 1)][isDay ? 'day' : 'night'];
}

/** Before any weather is in the chat: a clear sky, by day in light mode and by night in dark mode. */
const defaultSky = () => skyFor(1, document.documentElement.getAttribute('data-mantine-color-scheme') !== 'dark');

let current: Sky = defaultSky();
const listeners = new Set<() => void>();

function setSky(sky: Sky) {
  if (sky.top === current.top && sky.bottom === current.bottom) return;
  current = sky;
  document.documentElement.style.setProperty('--sky-top', sky.top);
  document.documentElement.style.setProperty('--sky-bottom', sky.bottom);
  listeners.forEach((l) => l());
}

export const useSky = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );

/** Follows the most recent weather in the conversation: current conditions, else the latest chart. */
export function skyFromMessages(messages: ChatMessage[]): void {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j] as any;
      if (p.state !== 'output-available') continue;
      if (p.type === 'tool-get_current') return setSky(skyFor(p.output.weatherCode, p.output.isDay));
      if (p.type === 'tool-show_chart') {
        const spec = p.output;
        if (spec.kind === 'hourly' && spec.hours?.length) {
          const h = spec.hours.find((x: any) => x.code != null) ?? spec.hours[0];
          return setSky(skyFor(h.code, h.isDay ?? true));
        }
        if (spec.kind === 'temperature_range' && spec.days?.[0]?.code != null) return setSky(skyFor(spec.days[0].code, true));
      }
    }
  }
  setSky(defaultSky());
}

setSky(current);
document.documentElement.style.setProperty('--sky-top', current.top);
document.documentElement.style.setProperty('--sky-bottom', current.bottom);
