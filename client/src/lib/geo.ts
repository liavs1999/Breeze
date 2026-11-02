import { read, write } from './storage';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface GlobePlace extends LatLon {
  name: string;
}

/**
 * The point on Earth where the sun is overhead right now (low-precision solar position, good to a
 * fraction of a degree), so the globe's day and night line is where it really is.
 */
export function subsolarPoint(date = new Date()): LatLon {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86_400_000 - 10_957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * rad;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * d) * rad;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
  const decl = Math.asin(Math.sin(e) * Math.sin(L)) / rad;
  let eqt = (q - ra) / 15; // equation of time, hours
  eqt = ((((eqt + 12) % 24) + 24) % 24) - 12;
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lon = -15 * (utcHours - 12 + eqt);
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: decl, lon };
}

/** The cities that glow on the globe with their temperature right now. */
export const WORLD_CITIES: GlobePlace[] = [
  { name: 'Reykjavík', lat: 64.15, lon: -21.94 },
  { name: 'Anchorage', lat: 61.22, lon: -149.9 },
  { name: 'Vancouver', lat: 49.28, lon: -123.12 },
  { name: 'San Francisco', lat: 37.77, lon: -122.42 },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { name: 'Honolulu', lat: 21.31, lon: -157.86 },
  { name: 'Mexico City', lat: 19.43, lon: -99.13 },
  { name: 'Chicago', lat: 41.88, lon: -87.63 },
  { name: 'Toronto', lat: 43.65, lon: -79.38 },
  { name: 'New York', lat: 40.71, lon: -74.01 },
  { name: 'Bogotá', lat: 4.71, lon: -74.07 },
  { name: 'Lima', lat: -12.05, lon: -77.04 },
  { name: 'São Paulo', lat: -23.55, lon: -46.63 },
  { name: 'Buenos Aires', lat: -34.6, lon: -58.38 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Paris', lat: 48.86, lon: 2.35 },
  { name: 'Madrid', lat: 40.42, lon: -3.7 },
  { name: 'Rome', lat: 41.9, lon: 12.5 },
  { name: 'Berlin', lat: 52.52, lon: 13.4 },
  { name: 'Stockholm', lat: 59.33, lon: 18.07 },
  { name: 'Moscow', lat: 55.76, lon: 37.62 },
  { name: 'Istanbul', lat: 41.01, lon: 28.98 },
  { name: 'Cairo', lat: 30.04, lon: 31.24 },
  { name: 'Tel Aviv', lat: 32.09, lon: 34.78 },
  { name: 'Lagos', lat: 6.52, lon: 3.38 },
  { name: 'Nairobi', lat: -1.29, lon: 36.82 },
  { name: 'Cape Town', lat: -33.92, lon: 18.42 },
  { name: 'Dubai', lat: 25.2, lon: 55.27 },
  { name: 'Mumbai', lat: 19.08, lon: 72.88 },
  { name: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'Bangkok', lat: 13.76, lon: 100.5 },
  { name: 'Singapore', lat: 1.35, lon: 103.82 },
  { name: 'Jakarta', lat: -6.21, lon: 106.85 },
  { name: 'Beijing', lat: 39.9, lon: 116.41 },
  { name: 'Shanghai', lat: 31.23, lon: 121.47 },
  { name: 'Seoul', lat: 37.57, lon: 126.98 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Perth', lat: -31.95, lon: 115.86 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
  { name: 'Auckland', lat: -36.85, lon: 174.76 },
];

export interface CityWeather extends GlobePlace {
  temperature: number;
}

const WORLD_KEY = 'breeze:world-now';

/**
 * Current temperatures for the globe's cities: one batched Open-Meteo request, kept for 30 minutes
 * in this tab. Null when it fails; the globe is complete without them.
 */
export async function worldTemperatures(): Promise<CityWeather[] | null> {
  try {
    const cached = JSON.parse(read(WORLD_KEY, 'session') ?? 'null') as { at: number; cities: CityWeather[] } | null;
    if (cached && Date.now() - cached.at < 30 * 60_000) return cached.cities;
  } catch {
    /* fetch again */
  }
  try {
    const lat = WORLD_CITIES.map((c) => c.lat).join(',');
    const lon = WORLD_CITIES.map((c) => c.lon).join(',');
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { current?: { temperature_2m?: number } }[];
    const cities = WORLD_CITIES.flatMap((c, i) => {
      const t = body[i]?.current?.temperature_2m;
      return typeof t === 'number' ? [{ ...c, temperature: t }] : [];
    });
    if (!cities.length) return null;
    write(WORLD_KEY, JSON.stringify({ at: Date.now(), cities }), 'session');
    return cities;
  } catch {
    return null;
  }
}

// ── Where a place in the conversation is ───────────────────────────────────────────────────────

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const GEO_KEY = 'breeze:geo';
const memo = new Map<string, Promise<GlobePlace | null>>();

/**
 * Coordinates for a place as the conversation names it ("Tokyo", "Reykjavik, Capital Region,
 * Iceland"): the globe's own cities first (instant), then Open-Meteo's geocoder, remembered in this
 * tab. Only used to aim the camera; the answer's data never depends on it.
 */
export function locatePlace(label: string): Promise<GlobePlace | null> {
  const key = fold(label);
  if (!key) return Promise.resolve(null);
  const hit = memo.get(key);
  if (hit) return hit;
  const parts = label.split(',').map((p) => p.trim()).filter(Boolean);
  const name = parts[0] ?? label;
  const country = parts.length > 1 ? fold(parts[parts.length - 1]) : '';
  const local = WORLD_CITIES.find((c) => fold(c.name) === fold(name));
  const promise = local
    ? Promise.resolve(local)
    : (async () => {
        try {
          const saved = JSON.parse(read(GEO_KEY, 'session') ?? '{}') as Record<string, GlobePlace>;
          if (saved[key]) return saved[key];
          const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`, {
            signal: AbortSignal.timeout(6000),
          });
          if (!res.ok) return null;
          const body = (await res.json()) as { results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[] };
          const results = body.results ?? [];
          const best = results.find((r) => country && (fold(r.country ?? '') === country || fold(r.admin1 ?? '') === country)) ?? results[0];
          if (!best) return null;
          const place = { name: best.name, lat: best.latitude, lon: best.longitude };
          write(GEO_KEY, JSON.stringify({ ...saved, [key]: place }), 'session');
          return place;
        } catch {
          return null;
        }
      })();
  memo.set(key, promise);
  return promise;
}
