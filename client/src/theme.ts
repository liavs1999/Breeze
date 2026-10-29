import { createTheme, type MantineColorsTuple } from '@mantine/core';

/** One accent (a clear system blue), neutral grays, soft large radii. */
const sky: MantineColorsTuple = [
  '#e5f1ff',
  '#cce3ff',
  '#99c7ff',
  '#66aaff',
  '#338eff',
  '#0a84ff',
  '#007aff',
  '#0066d6',
  '#0052ad',
  '#003e85',
];

const font = 'system-ui, "Inter Variable", Inter, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  primaryColor: 'sky',
  primaryShade: { light: 6, dark: 5 },
  colors: { sky },
  fontFamily: font,
  headings: { fontFamily: font, fontWeight: '700' },
  defaultRadius: 'lg',
  radius: { xs: '6px', sm: '10px', md: '14px', lg: '18px', xl: '26px' },
  cursorType: 'pointer',
  components: {
    Paper: { defaultProps: { radius: 'lg' } },
    Modal: { defaultProps: { radius: 'xl', centered: true, overlayProps: { backgroundOpacity: 0.35, blur: 8 } } },
    Menu: { defaultProps: { radius: 'lg', shadow: 'lg' } },
    Tooltip: { defaultProps: { openDelay: 300, radius: 'md' } },
    Button: { defaultProps: { radius: 'xl' } },
    Badge: { defaultProps: { radius: 'xl' } },
  },
});
