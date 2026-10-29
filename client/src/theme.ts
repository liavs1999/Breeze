import { createTheme, type MantineColorsTuple } from '@mantine/core';

/** One accent (a clear sky blue), neutral grays, generous radius: the whole visual language. */
const sky: MantineColorsTuple = [
  '#e8f3ff',
  '#d2e4fb',
  '#a6c7f2',
  '#77a8ea',
  '#508ee3',
  '#3a7ee0',
  '#2a78d6',
  '#1c64bf',
  '#0f58ab',
  '#004b97',
];

export const theme = createTheme({
  primaryColor: 'sky',
  primaryShade: { light: 6, dark: 5 },
  colors: { sky },
  fontFamily: '"Inter Variable", Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  headings: { fontFamily: '"Inter Variable", Inter, system-ui, sans-serif', fontWeight: '600' },
  defaultRadius: 'md',
  cursorType: 'pointer',
  components: {
    Paper: { defaultProps: { radius: 'lg' } },
    Modal: { defaultProps: { radius: 'lg', centered: true, overlayProps: { backgroundOpacity: 0.4, blur: 3 } } },
    Tooltip: { defaultProps: { openDelay: 300, withArrow: true } },
  },
});
