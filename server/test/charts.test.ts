import { describe, expect, it } from 'vitest';
import { buildChart, ChartRuleError } from '../src/agent/charts';
import { saveDataset } from '../src/weather/datasets';
import type { Dataset } from '../src/weather/openmeteo';

const place = (name: string) => ({ name, country: 'Testland', countryCode: 'TL', latitude: 1, longitude: 2, timezone: 'UTC' });

function daily(name: string, days: number, extra: Partial<Dataset> = {}) {
  const time = Array.from({ length: days }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
  const series = (base: number) => time.map((_, i) => base + i);
  return saveDataset({
    kind: 'forecast',
    place: place(name),
    granularity: 'daily',
    time,
    values: {
      temperature_max: series(20),
      temperature_min: series(10),
      temperature_mean: series(15),
      precipitation: series(0),
      rain: series(0),
      snow: time.map(() => 0),
      snowfall_cm: time.map(() => 0),
      precipitation_probability: time.map(() => 50),
      wind_max: series(10),
      weather_code: time.map(() => 3),
    },
    sourceNote: 'test',
    ...extra,
  });
}

describe('chart rules', () => {
  it('builds a temperature range chart from stored data, never from the model', () => {
    const ds = daily('Alpha', 7);
    const chart = buildChart({ kind: 'temperature_range', datasetIds: [ds.id] });
    expect(chart.kind).toBe('temperature_range');
    if (chart.kind !== 'temperature_range') return;
    expect(chart.days).toHaveLength(7);
    expect(chart.days[0]).toMatchObject({ date: '2026-11-01', min: 10, max: 20 });
  });

  it('rejects unknown datasets with an actionable reason', () => {
    expect(() => buildChart({ kind: 'temperature_range', datasetIds: ['ds-missing'] })).toThrow(/Fetch the data again/);
  });

  it('rejects charts with three or fewer points', () => {
    const ds = daily('Beta', 3);
    expect(() => buildChart({ kind: 'temperature_range', datasetIds: [ds.id] })).toThrow(ChartRuleError);
    expect(() => buildChart({ kind: 'temperature_range', datasetIds: [ds.id] })).toThrow(/Answer in text/);
  });

  it('needs 2 to 4 places to compare, and points one-place charts to compare', () => {
    const a = daily('A', 5);
    const b = daily('B', 5);
    expect(() => buildChart({ kind: 'compare', datasetIds: [a.id] })).toThrow(/2 to 4 places/);
    expect(() => buildChart({ kind: 'temperature_range', datasetIds: [a.id, b.id] })).toThrow(/use kind "compare"/);
    const five = Array.from({ length: 5 }, (_, i) => daily(`P${i}`, 5).id);
    expect(() => buildChart({ kind: 'compare', datasetIds: five })).toThrow(/At most 4/);
  });

  it('aligns compared places on the days they share', () => {
    const a = daily('A', 7);
    const b = daily('B', 5);
    const chart = buildChart({ kind: 'compare', datasetIds: [a.id, b.id], metric: 'temperature_max' });
    if (chart.kind !== 'compare') throw new Error('wrong kind');
    expect(chart.times).toHaveLength(5);
    expect(chart.places.map((p) => p.values.length)).toEqual([5, 5]);
  });

  it('requires normals for an anomaly chart', () => {
    const plain = daily('C', 7);
    expect(() => buildChart({ kind: 'anomaly', datasetIds: [plain.id] })).toThrow(/compare_to_normal/);
    const withNormals = daily('D', 7, { normals: { mean: Array(7).fill(14), min: Array(7).fill(9), max: Array(7).fill(19) } });
    const chart = buildChart({ kind: 'anomaly', datasetIds: [withNormals.id] });
    if (chart.kind !== 'anomaly') throw new Error('wrong kind');
    expect(chart.days[0]).toMatchObject({ value: 15, normal: 14, delta: 1 });
  });

  it('refuses to chart air quality data as weather', () => {
    const ds = daily('E', 7, { kind: 'air_quality' });
    expect(() => buildChart({ kind: 'temperature_range', datasetIds: [ds.id] })).toThrow(/cannot show air quality/);
  });
});
