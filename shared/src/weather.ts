import { z } from 'zod';

/** A resolved place, as returned by the geocoder. */
export const placeSchema = z.object({
  name: z.string(),
  admin1: z.string().optional(),
  country: z.string(),
  countryCode: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  population: z.number().optional(),
});
export type Place = z.infer<typeof placeSchema>;

/** Output of get_current: rendered by the client as the "now" card. */
export const currentWeatherSchema = z.object({
  place: placeSchema,
  observedAt: z.string(),
  temperature: z.number(),
  feelsLike: z.number(),
  humidity: z.number(),
  windSpeed: z.number(),
  windGusts: z.number(),
  windDirection: z.number(),
  precipitation: z.number(),
  cloudCover: z.number(),
  weatherCode: z.number(),
  condition: z.string(),
  isDay: z.boolean(),
  today: z.object({ min: z.number(), max: z.number(), precipitationChance: z.number().nullable() }),
  /** The next 24 hours: temperature, condition and day/night, for the hourly strip. */
  next24h: z.array(z.object({ time: z.string(), temperature: z.number(), code: z.number().optional(), isDay: z.boolean().optional() })),
  source: z.string(),
});
export type CurrentWeather = z.infer<typeof currentWeatherSchema>;

/** WMO weather interpretation codes → short descriptions. */
export const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Heavy freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Heavy freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Severe thunderstorm with hail',
};

export function describeWeatherCode(code: number | null | undefined): string {
  if (code == null) return 'Unknown';
  return WEATHER_CODES[code] ?? 'Unknown';
}
