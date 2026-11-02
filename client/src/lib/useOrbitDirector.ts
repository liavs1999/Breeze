import { useEffect, useRef } from 'react';
import { locatePlace } from './geo';
import { orbit } from './orbit';
import type { ChatMessage } from './types';

/**
 * Tells the globe what happens in the conversation: an empty chat is orbit; the first question starts
 * the search; each place the agent looks up is located and lit; once the answer has something to show,
 * the camera dives. A saved conversation opens straight in its sky.
 */
export function useOrbitDirector(messages: ChatMessage[], busy: boolean, isEmpty: boolean) {
  const wasEmpty = useRef<boolean | null>(null);
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (wasEmpty.current === null) {
      if (isEmpty) orbit.home();
      else orbit.sky();
    } else if (isEmpty && !wasEmpty.current) orbit.home();
    else if (!isEmpty && wasEmpty.current) {
      asked.current.clear();
      orbit.search();
    }
    wasEmpty.current = isEmpty;
  }, [isEmpty]);

  useEffect(() => {
    const stage = orbit.get().stage;
    if (stage !== 'search' && stage !== 'approach') return;
    const lastUser = messages.map((m) => m.role).lastIndexOf('user');
    const answer = messages.slice(lastUser + 1).find((m) => m.role === 'assistant');
    if (!answer) return;

    for (const part of answer.parts as any[]) {
      if (!part.type?.startsWith('tool-') || part.type === 'tool-find_place' || part.type === 'tool-show_chart') continue;
      if (part.type === 'tool-get_current' && part.state === 'output-available' && part.output?.place) {
        const p = part.output.place;
        orbit.addPlace({ name: p.name, lat: p.latitude, lon: p.longitude });
        continue;
      }
      const label: string | undefined = part.output?.resolved_to ?? part.input?.place;
      if (!label || asked.current.has(label)) continue;
      asked.current.add(label);
      const name = label.split(',')[0].trim();
      void locatePlace(label).then((p) => p && orbit.addPlace({ ...p, name }));
    }

    const hasSomething = answer.parts.some(
      (p: any) => (p.type === 'tool-show_chart' || p.type === 'tool-get_current') && (p.state === 'output-available' || p.state === 'output-error'),
    );
    const hasText = answer.parts.some((p) => p.type === 'text' && p.text.trim().length > 0);
    if (hasSomething || hasText || !busy) orbit.ready();
  }, [messages, busy]);
}
