import { createTheme, type MantineColorsTuple } from '@mantine/core';

/** One accent (a clear sky blue), neutral grays, soft large radii; Inter with optical sizes, so big numbers get the display cut. */
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

const font = '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const theme = createTheme({
  primaryColor: 'sky',
  primaryShade: { light: 6, dark: 5 },
  colors: { sky },
  fontFamily: font,
  headings: { fontFamily: font, fontWeight: '600' },
  defaultRadius: 'lg',
  radius: { xs: '6px', sm: '10px', md: '14px', lg: '20px', xl: '28px' },
  cursorType: 'pointer',
  components: {
    Paper: { defaultProps: { radius: 'lg' } },
    Modal: { defaultProps: { radius: 'xl', centered: true, overlayProps: { backgroundOpacity: 0.25, blur: 10 } } },
    Menu: { defaultProps: { radius: 'lg', shadow: 'lg' } },
    Tooltip: { defaultProps: { openDelay: 300, radius: 'md' } },
    Button: { defaultProps: { radius: 'xl' } },
    Badge: { defaultProps: { radius: 'xl' } },
  },
});
