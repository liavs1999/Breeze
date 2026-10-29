import {
  IconCloud,
  IconCloudBolt,
  IconCloudFog,
  IconCloudRain,
  IconCloudSnow,
  IconMoon,
  IconMoonStars,
  IconSun,
  IconSunHigh,
  IconCloudStorm,
  type Icon,
} from '@tabler/icons-react';

/** WMO weather codes → an icon. */
export function weatherIcon(code: number, isDay = true): Icon {
  if (code === 0) return isDay ? IconSunHigh : IconMoonStars;
  if (code === 1 || code === 2) return isDay ? IconSun : IconMoon;
  if (code === 3) return IconCloud;
  if (code === 45 || code === 48) return IconCloudFog;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return IconCloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return IconCloudSnow;
  if (code === 95) return IconCloudBolt;
  if (code >= 96) return IconCloudStorm;
  return IconCloud;
}
