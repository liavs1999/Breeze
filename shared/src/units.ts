export type UnitSystem = 'metric' | 'imperial';
export type Quantity = 'temperature' | 'precipitation' | 'wind' | 'percent' | 'aqi';

const SYMBOL: Record<UnitSystem, Record<Quantity, string>> = {
  metric: { temperature: '°C', precipitation: 'mm', wind: 'km/h', percent: '%', aqi: '' },
  imperial: { temperature: '°F', precipitation: 'in', wind: 'mph', percent: '%', aqi: '' },
};

/** Converts a metric value (°C, mm, km/h) to the requested unit system. */
export function convert(value: number, quantity: Quantity, units: UnitSystem): number {
  if (units === 'metric') return value;
  switch (quantity) {
    case 'temperature':
      return value * 1.8 + 32;
    case 'precipitation':
      return value / 25.4;
    case 'wind':
      return value / 1.609344;
    default:
      return value;
  }
}

export function unitSymbol(quantity: Quantity, units: UnitSystem): string {
  return SYMBOL[units][quantity];
}

const DIGITS: Record<Quantity, Record<UnitSystem, number>> = {
  temperature: { metric: 1, imperial: 0 },
  precipitation: { metric: 1, imperial: 2 },
  wind: { metric: 0, imperial: 0 },
  percent: { metric: 0, imperial: 0 },
  aqi: { metric: 0, imperial: 0 },
};

/** Converts and rounds for display; trailing ".0" is dropped. */
export function formatValue(value: number | null | undefined, quantity: Quantity, units: UnitSystem, withUnit = true): string {
  if (value == null || Number.isNaN(value)) return '–';
  const n = convert(value, quantity, units);
  const rounded = Number(n.toFixed(DIGITS[quantity][units]));
  const symbol = unitSymbol(quantity, units);
  if (!withUnit || !symbol) return String(rounded);
  return quantity === 'temperature' || quantity === 'percent' ? `${rounded}${symbol}` : `${rounded} ${symbol}`;
}
