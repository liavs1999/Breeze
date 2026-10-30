import type { ChartKind } from '@wwa/shared';
import type { ChatMessage } from './types';

export interface Suggestion {
  label: string;
  prompt: string;
}

type View = ChartKind | 'now';
type Next = Exclude<View, 'compare'>;

/** What naturally comes next after each kind of answer, best first. */
const NEXT: Record<View, Next[]> = {
  now: ['hourly', 'temperature_range', 'air_quality'],
  temperature_range: ['hourly', 'precipitation', 'anomaly'],
  hourly: ['temperature_range', 'now', 'air_quality'],
  precipitation: ['hourly', 'temperature_range', 'now'],
  compare: ['hourly', 'temperature_range', 'now'],
  anomaly: ['temperature_range', 'now', 'air_quality'],
  air_quality: ['temperature_range', 'hourly', 'now'],
};

const QUESTION: Record<Next, (place: string) => Suggestion> = {
  now: (p) => ({ label: `Right now`, prompt: `What's the weather in ${p} right now?` }),
  hourly: (p) => ({ label: `Hour by hour tomorrow`, prompt: `Hour by hour tomorrow in ${p}` }),
  temperature_range: (p) => ({ label: `Next 10 days`, prompt: `What will the weather be like in ${p} over the next 10 days?` }),
  precipitation: (p) => ({ label: `Rain this week`, prompt: `How much rain will ${p} get this week?` }),
  anomaly: (p) => ({ label: `Last month vs normal`, prompt: `Was last month warmer than normal in ${p}?` }),
  air_quality: (p) => ({ label: `Air quality`, prompt: `How's the air quality in ${p} over the next few days?` }),
};

/** A data tool result the server would also chart: 4+ days, 6+ hours, or 2+ days of air quality. */
function chartable(part: ChatMessage['parts'][number]): boolean {
  if (part.type !== 'tool-get_forecast' && part.type !== 'tool-get_history' && part.type !== 'tool-get_air_quality') return false;
  if (part.state !== 'output-available') return false;
  const o = part.output as { dataset_id?: string; summary?: { days?: number; hours?: number }; days?: unknown[] };
  return Boolean(o.dataset_id) && ((o.summary?.days ?? 0) >= 4 || (o.summary?.hours ?? 0) >= 6 || (part.type === 'tool-get_air_quality' && (o.days?.length ?? 0) >= 2));
}

/**
 * What to offer under the latest answer, read from the answer itself (no extra model call):
 * - it fetched data worth a chart but answered in text: "Show as a chart";
 * - the agent asked which place was meant: the places it found, as choices;
 * - it showed weather for a place: two or three natural next questions about that place.
 */
export function suggestionsFor(message: ChatMessage | undefined): { kind: 'places' | 'next'; items: Suggestion[] } | null {
  if (!message || message.role !== 'assistant') return null;
  const shown: View[] = [];
  let place: string | null = null;
  let places: string[] = [];

  for (const part of message.parts) {
    if (part.type === 'tool-get_current' && part.state === 'output-available') {
      shown.push('now');
      place = part.output.place.name;
    } else if (part.type === 'tool-show_chart' && part.state === 'output-available') {
      const spec = part.output;
      // Past data has its own follow-ups; the forecast ones below are about the coming days.
      shown.push(spec.kind === 'temperature_range' && !/forecast/i.test(spec.source) ? 'anomaly' : spec.kind);
      if (spec.kind === 'compare') {
        places = spec.places.map((p) => p.name);
        place = places[0] ?? place;
      } else {
        place = spec.place.name;
      }
    }
  }

  if (!shown.length) {
    // Data that could be a chart but was answered in text (for example "text only"): offer the chart.
    if (message.parts.some(chartable)) return { kind: 'next', items: [{ label: 'Show as a chart', prompt: 'Show that as a chart' }] };
    const lookup = message.parts.findLast((p) => p.type === 'tool-find_place' && p.state === 'output-available');
    const matches = lookup?.type === 'tool-find_place' && lookup.state === 'output-available' ? lookup.output.matches : [];
    if (matches.length < 2) return null;
    return { kind: 'places', items: matches.slice(0, 5).map((m) => ({ label: m.name, prompt: m.name })) };
  }
  if (!place) return null;

  const last = shown[shown.length - 1];
  const items = NEXT[last]
    .filter((v) => !shown.includes(v))
    .slice(0, places.length > 1 ? 2 : 3)
    .map((v) => QUESTION[v](place!));
  if (places.length > 1) {
    const list = places.length === 2 ? places.join(' and ') : `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}`;
    items.push({ label: `Compare rain`, prompt: `Compare rain in ${list} over the next 7 days` });
  }
  // Labels without the place read oddly when the answer covered several places; name the place.
  if (places.length > 1) items.forEach((s, i) => i < items.length - 1 && (s.label = `${s.label} · ${place}`));
  return items.length ? { kind: 'next', items } : null;
}
