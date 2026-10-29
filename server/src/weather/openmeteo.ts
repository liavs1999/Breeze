import { describeWeatherCode, type CurrentWeather, type Place } from '@wwa/shared';
import { fetchJson, WeatherApiError } from './http';

const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const AIR_QUALITY = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export const SOURCE = 'Open-Meteo';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

type Series = (number | null)[];

/** A time series kept on the server; charts are built from it by id. Values are metric. */
export interface Dataset {
  id: string;
  kind: 'forecast' | 'history' | 'air_quality';
  place: Place;
  granularity: 'daily' | 'hourly';
  /** Local times in the place's timezone: YYYY-MM-DD (daily) or YYYY-MM-DDTHH:mm (hourly). */
  time: string[];
  values: Record<string, Series>;
  /** Daily mean temperature normal (1991–2020) for the same calendar days, when requested. */
  normals?: { mean: Series; min: Series; max: Series };
  sourceNote: string;
}

// ── Places ──────────────────────────────────────────────────────────────────────────────────────

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  timezone?: string;
  population?: number;
  feature_code?: string;
}

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/**
 * Finds places by name. "Paris, Texas" style hints narrow the result by region or country.
 * Results are ordered by relevance and population, as returned by the geocoder.
 */
export async function searchPlaces(query: string, count = 5): Promise<Place[]> {
  const coords = COORDS.exec(query);
  if (coords) {
    const latitude = Number(coords[1]);
    const longitude = Number(coords[2]);
    return [{ name: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`, country: '', countryCode: '', latitude, longitude, timezone: 'auto' }];
  }

  const [name, ...hintParts] = query.split(',').map((s) => s.trim()).filter(Boolean);
  if (!name) return [];
  const hint = hintParts.join(' ').toLowerCase();
  const url = `${GEOCODING}?name=${encodeURIComponent(name)}&count=${hint ? 20 : count}&language=en&format=json`;
  const data = await fetchJson<{ results?: GeoResult[] }>(url, 30 * DAY);
  let results = data.results ?? [];
  if (hint) {
    const matches = results.filter((r) =>
      [r.country, r.country_code, r.admin1].some((v) => v && (v.toLowerCase().includes(hint) || hint.includes(v.toLowerCase()))),
    );
    if (matches.length) results = matches;
  }
  return results.slice(0, count).map(toPlace);
}

function toPlace(r: GeoResult): Place {
  return {
    name: r.name,
    admin1: r.admin1,
    country: r.country ?? '',
    countryCode: r.country_code ?? '',
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone ?? 'auto',
    population: r.population,
  };
}

export class PlaceNotFoundError extends Error {}

export async function resolvePlace(query: string): Promise<{ place: Place; alternatives: Place[] }> {
  const places = await searchPlaces(query, 5);
  if (!places.length) throw new PlaceNotFoundError(`No place called "${query}" was found. Check the spelling or add the country.`);
  const [place, ...rest] = places;
  // Other well-known places with the same name, so the agent can mention or ask.
  const alternatives = rest.filter(
    (p) => (p.population ?? 0) >= 50_000 && (p.countryCode !== place.countryCode || p.admin1 !== place.admin1),
  );
  return { place, alternatives };
}

export const placeLabel = (p: Place) => [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : null, p.country].filter(Boolean).join(', ');

const at = (p: Place) => `latitude=${p.latitude}&longitude=${p.longitude}&timezone=${encodeURIComponent(p.timezone)}`;

// ── Current conditions ──────────────────────────────────────────────────────────────────────────

export async function getCurrent(place: Place): Promise<CurrentWeather> {
  const current = 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day';
  const url = `${FORECAST}?${at(place)}&current=${current}&hourly=temperature_2m&forecast_hours=24&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1`;
  const d = await fetchJson<any>(url, 10 * MIN);
  const c = d.current;
  return {
    place: { ...place, timezone: d.timezone ?? place.timezone },
    observedAt: c.time,
    temperature: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windSpeed: c.wind_speed_10m,
    windGusts: c.wind_gusts_10m,
    windDirection: c.wind_direction_10m,
    precipitation: c.precipitation,
    cloudCover: c.cloud_cover,
    weatherCode: c.weather_code,
    condition: describeWeatherCode(c.weather_code),
    isDay: c.is_day === 1,
    today: {
      min: d.daily.temperature_2m_min[0],
      max: d.daily.temperature_2m_max[0],
      precipitationChance: d.daily.precipitation_probability_max?.[0] ?? null,
    },
    next24h: (d.hourly.time as string[]).map((time, i) => ({ time, temperature: d.hourly.temperature_2m[i] })),
    source: SOURCE,
  };
}

// ── Forecast and history ────────────────────────────────────────────────────────────────────────

const DAILY_VARS = 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_probability_max,wind_speed_10m_max,weather_code';
const HISTORY_DAILY_VARS = 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,rain_sum,snowfall_sum,wind_speed_10m_max,weather_code';
const HOURLY_VARS = 'temperature_2m,precipitation_probability,precipitation,rain,showers,snowfall,wind_speed_10m,weather_code';
const HISTORY_HOURLY_VARS = 'temperature_2m,precipitation,rain,snowfall,wind_speed_10m,weather_code';

function dailyValues(daily: any): Record<string, Series> {
  const mean: Series = daily.temperature_2m_mean ?? daily.temperature_2m_max.map((max: number | null, i: number) => {
    const min = daily.temperature_2m_min[i];
    return max == null || min == null ? null : (max + min) / 2;
  });
  const precipitation: Series = daily.precipitation_sum;
  const liquid: Series = (daily.rain_sum as Series).map((r, i) => (r == null ? null : r + (daily.showers_sum?.[i] ?? 0)));
  return {
    temperature_max: daily.temperature_2m_max,
    temperature_min: daily.temperature_2m_min,
    temperature_mean: mean,
    precipitation,
    rain: liquid,
    // Snow as water equivalent (mm), so rain and snow share one axis; snowfall depth (cm) is kept separately.
    snow: precipitation.map((p, i) => (p == null ? null : Math.max(0, p - (liquid[i] ?? 0)))),
    snowfall_cm: daily.snowfall_sum,
    precipitation_probability: daily.precipitation_probability_max ?? [],
    wind_max: daily.wind_speed_10m_max,
    weather_code: daily.weather_code,
  };
}

function hourlyValues(hourly: any): Record<string, Series> {
  const precipitation: Series = hourly.precipitation;
  const liquid: Series = (hourly.rain as Series).map((r, i) => (r == null ? null : r + (hourly.showers?.[i] ?? 0)));
  return {
    temperature: hourly.temperature_2m,
    precipitation,
    rain: liquid,
    snow: precipitation.map((p, i) => (p == null ? null : Math.max(0, p - (liquid[i] ?? 0)))),
    snowfall_cm: hourly.snowfall,
    precipitation_probability: hourly.precipitation_probability ?? [],
    wind: hourly.wind_speed_10m,
    weather_code: hourly.weather_code,
  };
}

export async function getForecast(place: Place, opts: { granularity: 'daily' | 'hourly'; days?: number; hours?: number }): Promise<Omit<Dataset, 'id'>> {
  if (opts.granularity === 'daily') {
    const days = clamp(opts.days ?? 7, 1, 16);
    const d = await fetchJson<any>(`${FORECAST}?${at(place)}&daily=${DAILY_VARS}&forecast_days=${days}`, 15 * MIN);
    return { kind: 'forecast', place: withTz(place, d), granularity: 'daily', time: d.daily.time, values: dailyValues(d.daily), sourceNote: `${SOURCE} forecast` };
  }
  const hours = clamp(opts.hours ?? 48, 6, 168);
  const d = await fetchJson<any>(`${FORECAST}?${at(place)}&hourly=${HOURLY_VARS}&forecast_hours=${hours}`, 15 * MIN);
  return { kind: 'forecast', place: withTz(place, d), granularity: 'hourly', time: d.hourly.time, values: hourlyValues(d.hourly), sourceNote: `${SOURCE} forecast` };
}

/** Past weather. The last 92 days come from the forecast API (no reporting delay); older days from ERA5. */
export async function getHistory(place: Place, opts: { start: string; end: string; granularity: 'daily' | 'hourly' }): Promise<Omit<Dataset, 'id'>> {
  const recent = daysAgo(opts.start) <= 90;
  const base = recent ? FORECAST : ARCHIVE;
  const ttl = recent ? 60 * MIN : 30 * DAY;
  const range = `start_date=${opts.start}&end_date=${opts.end}`;
  const sourceNote = recent ? `${SOURCE} (recent analysis)` : `${SOURCE} historical (ERA5)`;
  if (opts.granularity === 'hourly') {
    const d = await fetchJson<any>(`${base}?${at(place)}&${range}&hourly=${recent ? HOURLY_VARS : HISTORY_HOURLY_VARS}`, ttl);
    return { kind: 'history', place: withTz(place, d), granularity: 'hourly', time: d.hourly.time, values: hourlyValues(d.hourly), sourceNote };
  }
  const d = await fetchJson<any>(`${base}?${at(place)}&${range}&daily=${recent ? DAILY_VARS : HISTORY_DAILY_VARS}`, ttl);
  return { kind: 'history', place: withTz(place, d), granularity: 'daily', time: d.daily.time, values: dailyValues(d.daily), sourceNote };
}

/**
 * The 1991–2020 normal for each calendar day in `dates` (≤ 92 days): the mean of the same days in each
 * of those 30 years. One small archive request per year keeps each request light for the API's quota.
 */
export async function getNormals(place: Place, dates: string[]): Promise<{ mean: Series; min: Series; max: Series }> {
  if (!dates.length || dates.length > 92) throw new WeatherApiError('Normals are available for windows of up to 92 days');
  const first = dates[0];
  const last = dates[dates.length - 1];
  const spansYear = last.slice(0, 4) !== first.slice(0, 4);
  const lat = place.latitude.toFixed(2);
  const lon = place.longitude.toFixed(2);
  const years = Array.from({ length: 30 }, (_, i) => 1991 + i);

  const perYear = await mapLimit(years, 6, async (year) => {
    const start = `${year}-${first.slice(5)}`.replace(`${year}-02-29`, `${year}-02-28`);
    const endYear = spansYear ? year + 1 : year;
    const end = `${endYear}-${last.slice(5)}`.replace(`${endYear}-02-29`, `${endYear}-02-28`);
    const url = `${ARCHIVE}?latitude=${lat}&longitude=${lon}&timezone=${encodeURIComponent(place.timezone)}&start_date=${start}&end_date=${end}&daily=temperature_2m_mean,temperature_2m_min,temperature_2m_max`;
    const d = await fetchJson<any>(url, 365 * DAY);
    const byDay = new Map<string, [number | null, number | null, number | null]>();
    (d.daily.time as string[]).forEach((t, i) =>
      byDay.set(t.slice(5), [d.daily.temperature_2m_mean[i], d.daily.temperature_2m_min[i], d.daily.temperature_2m_max[i]]),
    );
    return byDay;
  });

  const avg = (k: 0 | 1 | 2) =>
    dates.map((date) => {
      const vals = perYear.map((m) => m.get(date.slice(5))?.[k]).filter((v): v is number => v != null);
      return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    });
  return { mean: avg(0), min: avg(1), max: avg(2) };
}

// ── Air quality ─────────────────────────────────────────────────────────────────────────────────

export async function getAirQuality(place: Place, days: number): Promise<Omit<Dataset, 'id'>> {
  const d = await fetchJson<any>(`${AIR_QUALITY}?${at(place)}&hourly=european_aqi,pm2_5,pm10&forecast_days=${clamp(days, 1, 5)}`, 30 * MIN);
  return {
    kind: 'air_quality',
    place: withTz(place, d),
    granularity: 'hourly',
    time: d.hourly.time,
    values: { aqi: d.hourly.european_aqi, pm25: d.hourly.pm2_5, pm10: d.hourly.pm10 },
    sourceNote: `${SOURCE} air quality (CAMS)`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

const withTz = (place: Place, d: { timezone?: string }) => ({ ...place, timezone: d.timezone ?? place.timezone });
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
const round = (n: number) => Math.round(n * 10) / 10;

function daysAgo(date: string): number {
  return Math.floor((Date.now() - Date.parse(`${date}T00:00:00Z`)) / DAY);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}
