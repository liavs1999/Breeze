import type { ReactNode } from 'react';
import { aqiLabel, describeWeatherCode, type ChartSpec, type CompareMetric, type Quantity, type UnitSystem } from '@wwa/shared';
import { AirQualityChart } from './AirQualityChart';
import { AnomalyChart } from './AnomalyChart';
import { display, fullTime } from './common';
import { CompareChart } from './CompareChart';
import { DailyForecast } from './DailyForecast';
import { HourlyChart } from './HourlyChart';
import { PrecipitationChart } from './PrecipitationChart';
import { RangeColumns } from './RangeColumns';

export interface RenderedChart {
  body: ReactNode;
  /** The same values as a table ("Data" view), so nothing depends on seeing the chart. */
  table: { columns: string[]; rows: (string | number)[][] };
  /** One-sentence description for screen readers. */
  label: string;
}

const QUANTITY: Record<CompareMetric, Quantity> = {
  temperature_max: 'temperature',
  temperature_min: 'temperature',
  temperature_mean: 'temperature',
  precipitation: 'precipitation',
  wind_max: 'wind',
};

/** Picks the view for a chart spec and builds its table. Day lists up to 16 days; columns beyond. */
export function renderChart(spec: ChartSpec, units: UnitSystem): RenderedChart {
  switch (spec.kind) {
    case 'temperature_range': {
      const hasNormal = spec.days.some((d) => d.normalMax != null);
      const hasChance = spec.days.some((d) => d.rainChance != null);
      const columns = spec.days.length > 16 || hasNormal;
      return {
        label: `${spec.title}. Daily lows and highs for ${spec.days.length} days.`,
        body: columns ? <RangeColumns spec={spec} units={units} /> : <DailyForecast spec={spec} units={units} />,
        table: {
          columns: ['Day', 'Conditions', 'Low', 'High', ...(hasChance ? ['Chance of rain'] : []), ...(hasNormal ? ['Normal low', 'Normal high'] : [])],
          rows: spec.days.map((d) => [
            fullTime(d.date),
            d.code == null ? '–' : describeWeatherCode(d.code),
            display(d.min, 'temperature', units),
            display(d.max, 'temperature', units),
            ...(hasChance ? [d.rainChance == null ? '–' : `${d.rainChance}%`] : []),
            ...(hasNormal ? [display(d.normalMin, 'temperature', units), display(d.normalMax, 'temperature', units)] : []),
          ]),
        },
      };
    }
    case 'hourly': {
      const probability = spec.rainMeasure === 'probability';
      const rainLabel = probability ? 'Chance of rain' : 'Rain';
      return {
        label: `${spec.title}. Hourly temperature and ${rainLabel.toLowerCase()}.`,
        body: <HourlyChart spec={spec} units={units} />,
        table: {
          columns: ['Time', 'Conditions', 'Temperature', rainLabel],
          rows: spec.hours.map((h) => [
            fullTime(h.time),
            h.code == null ? '–' : describeWeatherCode(h.code),
            display(h.temperature, 'temperature', units),
            probability ? `${h.rain ?? '–'}%` : display(h.rain, 'precipitation', units),
          ]),
        },
      };
    }
    case 'precipitation':
      return {
        label: `${spec.title}. ${spec.granularity === 'daily' ? 'Daily' : 'Hourly'} precipitation.`,
        body: <PrecipitationChart spec={spec} units={units} />,
        table: {
          columns: [spec.granularity === 'daily' ? 'Day' : 'Time', 'Rain', ...(spec.hasSnow ? ['Snow (water eq.)'] : [])],
          rows: spec.points.map((p) => [fullTime(p.time), display(p.rain, 'precipitation', units), ...(spec.hasSnow ? [display(p.snow, 'precipitation', units)] : [])]),
        },
      };
    case 'compare': {
      const q = QUANTITY[spec.metric];
      return {
        label: `${spec.title}, ${spec.places.length} places.`,
        body: <CompareChart spec={spec} units={units} />,
        table: {
          columns: [spec.granularity === 'daily' ? 'Day' : 'Time', ...spec.places.map((p) => p.name)],
          rows: spec.times.map((t, i) => [fullTime(t), ...spec.places.map((p) => display(p.values[i], q, units))]),
        },
      };
    }
    case 'anomaly': {
      const k = units === 'imperial' ? 1.8 : 1;
      return {
        label: `${spec.title}. Daily difference from the 1991–2020 normal.`,
        body: <AnomalyChart spec={spec} units={units} />,
        table: {
          columns: ['Day', 'Daily mean', 'Normal', 'Difference'],
          rows: spec.days.map((d) => [
            fullTime(d.date),
            display(d.value, 'temperature', units),
            display(d.normal, 'temperature', units),
            d.delta == null ? '–' : `${d.delta > 0 ? '+' : ''}${(d.delta * k).toFixed(1)}°`,
          ]),
        },
      };
    }
    case 'air_quality':
      return {
        label: `${spec.title}. European air quality index.`,
        body: <AirQualityChart spec={spec} />,
        table: {
          columns: [spec.granularity === 'daily' ? 'Day' : 'Time', 'AQI', 'Level', 'PM2.5 (µg/m³)'],
          rows: spec.points.map((p) => [fullTime(p.time), p.aqi ?? '–', p.aqi == null ? '–' : aqiLabel(p.aqi), p.pm25 == null ? '–' : Math.round(p.pm25)]),
        },
      };
  }
}
