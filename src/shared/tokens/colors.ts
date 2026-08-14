const palette = {
  indigoDeep: '#0d0d1a',
  indigoMid: '#1a1a3e',
  indigoLight: '#2d2d6b',
  purple: '#7c5cbf',
  purpleLight: '#9f7dd8',
  amethyst: '#b399e0',
  moonWhite: '#f0eeff',
  stardust: '#c8c0e8',
  cosmicGray: '#6b6882',
  ember: '#e05c5c',
  jade: '#5cb87a',
  amber: '#e0a85c',
  white: '#ffffff',
  black: '#000000',
} as const;

export const colors = {
  light: {
    background: palette.moonWhite,
    surface: palette.white,
    surfaceElevated: '#f8f6ff',
    text: palette.indigoDeep,
    textSecondary: palette.cosmicGray,
    accent: palette.purple,
    accentLight: palette.purpleLight,
    error: palette.ember,
    success: palette.jade,
    warning: palette.amber,
    border: '#ddd8f0',
    icon: palette.cosmicGray,
  },
  dark: {
    background: palette.indigoDeep,
    surface: palette.indigoMid,
    surfaceElevated: '#222244',
    text: palette.moonWhite,
    textSecondary: palette.stardust,
    accent: palette.amethyst,
    accentLight: palette.purpleLight,
    error: '#f08080',
    success: '#80c896',
    warning: '#e8c080',
    border: '#3a3a6a',
    icon: palette.stardust,
  },
  // Flat aliases for convenience in non-themed contexts
  primary: palette.purple,
  error: palette.ember,
  success: palette.jade,
  warning: palette.amber,
} as const;

export type ColorScheme = 'light' | 'dark';
export type ColorToken = keyof typeof colors.dark;
