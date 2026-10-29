import { Group, Stack, Text } from '@mantine/core';
import { IconDroplet, IconTemperature, IconUmbrella, IconWind } from '@tabler/icons-react';
import { convert, formatValue, type CurrentWeather } from '@wwa/shared';
import { useSettings } from '../lib/settings';
import { skyFor } from '../lib/sky';
import { weatherIcon } from './weatherIcons';

/**
 * Current conditions as a sky card: the place, one large light-weight temperature, the condition and
 * today's high and low, then a frosted panel with the next hours (time, icon, temperature) and a few
 * facts. The card's gradient is the sky for this weather at this time of day.
 */
export function NowCard({ data }: { data: CurrentWeather & { stale?: boolean } }) {
  const { units } = useSettings().settings;
  const sky = skyFor(data.weatherCode, data.isDay);
  const t = (v: number) => `${Math.round(convert(v, 'temperature', units))}°`;
  const local = new Date(`${data.observedAt}:00Z`).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const Icon = weatherIcon(data.weatherCode, data.isDay);
  const hours = data.next24h.slice(0, 12);

  return (
    <div className="now-card" style={{ background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.bottom} 100%)` }}>
      <Stack align="center" gap={0}>
        <Text fz={24} fw={500} lh={1.2} ta="center">
          {data.place.name}
        </Text>
        <Text fz={13} fw={500} opacity={0.85}>
          {[data.place.country, `${local} local time`].filter(Boolean).join(' · ')}
        </Text>
        <Text fz={84} fw={200} lh={1.05} mt={2} style={{ letterSpacing: '-0.03em', paddingLeft: '0.2em' }}>
          {t(data.temperature)}
        </Text>
        <Group gap={6}>
          <Icon size={20} stroke={1.8} aria-hidden />
          <Text fz={18} fw={500}>
            {data.condition}
          </Text>
        </Group>
        <Text fz={17} fw={500} mt={2}>
          H:{t(data.today.max)}  L:{t(data.today.min)}
        </Text>
      </Stack>

      <div className="now-panel" style={{ marginTop: 16 }}>
        <Group gap={14} wrap="wrap" style={{ fontSize: 13, fontWeight: 500, opacity: 0.92 }}>
          <Fact icon={IconTemperature} text={`Feels like ${t(data.feelsLike)}`} />
          <Fact icon={IconWind} text={`${formatValue(data.windSpeed, 'wind', units)}, gusts ${formatValue(data.windGusts, 'wind', units)}`} />
          <Fact icon={IconDroplet} text={`Humidity ${data.humidity}%`} />
          <Fact icon={IconUmbrella} text={`Rain ${data.today.precipitationChance ?? 0}% today`} />
        </Group>
        <div style={{ height: 0.5, background: 'rgba(255,255,255,0.25)', margin: '10px 0 2px' }} />
        <div className="hour-strip" aria-label="Next hours">
          {hours.map((h, i) => {
            // "Now" is the current reading (the same as the big number), not the hour's forecast.
            const now = i === 0;
            const HourIcon = weatherIcon(now ? data.weatherCode : h.code ?? data.weatherCode, now ? data.isDay : h.isDay ?? data.isDay);
            return (
              <div key={h.time} className="hour-cell">
                <span style={{ opacity: 0.9 }}>{now ? 'Now' : h.time.slice(11, 13)}</span>
                <HourIcon size={22} stroke={1.6} aria-hidden />
                <span style={{ fontSize: 16 }}>{t(now ? data.temperature : h.temperature)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Fact({ icon: FactIcon, text }: { icon: typeof IconWind; text: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <FactIcon size={15} stroke={1.8} aria-hidden />
      {text}
    </span>
  );
}
