import { Text, Tooltip } from '@mantine/core';
import { convert, describeWeatherCode, type ChartOf, type UnitSystem } from '@wwa/shared';
import { weatherIcon } from '../components/weatherIcons';
import { dayMonth, deg, localDate, weekdayShort } from './parts';
import { gradientStops } from './temperatureColors';

/**
 * Day rows: weekday, condition (with the chance of rain when it matters), low, a bar from low to high
 * on a scale shared by all days and colored by temperature, high. Reads at a glance; every value is
 * printed, so no hover is needed.
 */
export function DailyForecast({ spec, units }: { spec: ChartOf<'temperature_range'>; units: UnitSystem }) {
  const days = spec.days.map((d) => ({
    ...d,
    lo: d.min == null ? null : convert(d.min, 'temperature', units),
    hi: d.max == null ? null : convert(d.max, 'temperature', units),
  }));
  const valid = days.filter((d) => d.lo != null && d.hi != null);
  if (!valid.length) return <Text size="sm" c="dimmed">No temperature data for these days.</Text>;
  const min = Math.min(...valid.map((d) => d.lo!));
  const max = Math.max(...valid.map((d) => d.hi!));
  const span = max - min || 1;
  const today = localDate(spec.place.timezone);
  const spansMonths = new Set(days.map((d) => d.date.slice(0, 7))).size > 1 || days.length > 7;

  return (
    <div data-chart role="img" aria-label={`${spec.title}. ${valid.map((d) => `${weekdayShort(d.date)} ${deg(d.lo!)} to ${deg(d.hi!)}`).join(', ')}.`}>
      {days.map((d) => {
        const DayIcon = weatherIcon(d.code ?? 3, true);
        const label = d.date === today ? 'Today' : weekdayShort(d.date);
        if (d.lo == null || d.hi == null) {
          return (
            <div key={d.date} className="day-row">
              <Text fw={500}>{label}</Text>
              <span />
              <Text c="dimmed" size="sm" style={{ gridColumn: '3 / -1' }}>
                No data
              </Text>
            </div>
          );
        }
        const left = ((d.lo - min) / span) * 100;
        const width = Math.max(((d.hi - d.lo) / span) * 100, 3);
        const stops = gradientStops(d.max!, d.min!)
          .reverse()
          .map((s) => `${s.color} ${((1 - s.offset) * 100).toFixed(1)}%`)
          .join(', ');
        return (
          <div key={d.date} className="day-row">
            <div>
              <Text fw={500} lh={1.2}>
                {label}
              </Text>
              {spansMonths && (
                <Text size="xs" c="dimmed" lh={1.2}>
                  {dayMonth(d.date)}
                </Text>
              )}
            </div>
            <Tooltip label={describeWeatherCode(d.code)} openDelay={200}>
              <div className="day-icon">
                <DayIcon size={22} stroke={1.5} aria-hidden />
                {(d.rainChance ?? 0) >= 20 && <span className="rain-chance">{d.rainChance}%</span>}
              </div>
            </Tooltip>
            <Text c="dimmed" ta="right" fw={500}>
              {deg(d.lo)}
            </Text>
            <div className="range-track" aria-hidden>
              <div className="range-fill" style={{ left: `${Math.min(left, 97)}%`, width: `${width}%`, background: `linear-gradient(90deg, ${stops})` }} />
            </div>
            <Text ta="right" fw={600}>
              {deg(d.hi)}
            </Text>
          </div>
        );
      })}
    </div>
  );
}
