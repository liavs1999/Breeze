import { useSyncExternalStore } from 'react';
import type { GlobePlace } from './geo';

/**
 * Where the viewer is: in orbit (the welcome, the globe), searching for the place in the question,
 * approaching it, diving through its clouds, or in its sky (the conversation). The chat page says what
 * happened (a question was sent, a place was found, the answer is ready); the globe (Orbit) moves the
 * camera and calls `arrive()` when the dive is over. Without WebGL there is no globe: every step lands
 * straight in the sky.
 */
export type Stage = 'orbit' | 'search' | 'approach' | 'dive' | 'sky';

interface State {
  stage: Stage;
  /** The places of the current question, in the order they were found; the first one is dived into. */
  places: GlobePlace[];
  /** True when the step should happen without a camera flight (a page load, reduced motion). */
  instant: boolean;
}

let state: State = { stage: 'orbit', places: [], instant: true };
let globe = false;
let ready = false;
let fallback: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const root = document.documentElement;

/** Time for the flight. */
export const orbitNow = (): number => performance.now();
export const later = (fn: () => void, ms: number) => setTimeout(fn, ms);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  root.dataset.stage = state.stage;
  listeners.forEach((l) => l());
}

export const orbit = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** The globe reports whether it could start (WebGL). */
  setGlobe(available: boolean) {
    globe = available;
    root.dataset.orbit = available ? 'on' : 'off';
    if (!available && state.stage !== 'orbit' && state.stage !== 'sky') set({ stage: 'sky', instant: true });
  },
  hasGlobe: () => globe,

  /** The welcome: fly back out to orbit (instantly on a page load). */
  home(instant = false) {
    clearTimeout(fallback);
    ready = false;
    if (state.stage === 'orbit') return;
    set({ stage: 'orbit', places: state.places, instant: instant || reducedMotion() });
  },

  /** A saved conversation was opened: be in its sky at once. */
  sky() {
    clearTimeout(fallback);
    if (state.stage !== 'sky') set({ stage: 'sky', instant: true });
  },

  /** The first question was sent from orbit: drift, looking for the place. */
  search() {
    if (state.stage !== 'orbit') return;
    ready = false;
    if (!globe) return set({ stage: 'sky', places: [], instant: true });
    set({ stage: 'search', places: [], instant: false });
    // Nothing found after a while (an error, a question without a place): land in the sky anyway.
    clearTimeout(fallback);
    fallback = later(() => orbit.arrive(), 12_000);
  },

  /** A place of the question is known. */
  addPlace(place: GlobePlace) {
    if (state.stage !== 'search' && state.stage !== 'approach') return;
    if (state.places.some((p) => Math.abs(p.lat - place.lat) < 0.05 && Math.abs(p.lon - place.lon) < 0.05)) return;
    set({ stage: 'approach', places: [...state.places, place] });
    if (ready) scheduleDive();
  },

  /** The answer has something to show: dive as soon as a place is known. */
  ready() {
    if (ready) return;
    ready = true;
    if (state.stage === 'approach') scheduleDive();
    else if (state.stage === 'search') {
      // Give the place a moment to resolve; without one, cross into the sky.
      clearTimeout(fallback);
      fallback = later(() => (state.stage === 'search' ? orbit.arrive() : undefined), 1800);
    }
  },

  /** The dive is over (or there is nothing to dive into): the conversation's sky. */
  arrive() {
    clearTimeout(fallback);
    if (state.stage !== 'sky' && state.stage !== 'orbit') set({ stage: 'sky', instant: false });
  },
};

let diveTimer: ReturnType<typeof setTimeout> | undefined;
/** A short pause after the last place, so a comparison's places all light up before the dive. */
function scheduleDive() {
  clearTimeout(diveTimer);
  diveTimer = later(() => {
    if (state.stage === 'approach') set({ stage: 'dive', instant: reducedMotion() });
  }, 500);
}

export function useStage(): Stage {
  return useSyncExternalStore(orbit.subscribe, () => state.stage);
}

root.dataset.stage = state.stage;
